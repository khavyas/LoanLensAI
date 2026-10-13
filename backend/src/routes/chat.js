import { Router } from 'express';
import Application from '../models/Application.js';
import { requireAuth } from '../middleware/auth.js';
import { answerQuestion } from '../services/rag.js';
import { canAccessChatApplication } from '../services/chatAccess.js';

const router = Router();
router.use(requireAuth);

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasUnmatchedPersonReference(question) {
  const text = normalizeName(question);
  const patterns = [
    /\b(?:what is|tell me about|show me|status of)\s+([a-z]+\s+[a-z]+)\s+(?:loan|application|account)\b/,
    /\b(?:does|did|has)\s+([a-z]+\s+[a-z]+)\s+(?:claim|apply|request|submit|have)\b/,
  ];
  const nonNameStarts = new Set([
    'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'this', 'current',
    'personal', 'auto', 'car', 'small', 'business',
  ]);
  return patterns.some((pattern) => {
    const candidate = text.match(pattern)?.[1];
    return candidate && !nonNameStarts.has(candidate.split(' ')[0]);
  });
}

router.post('/:applicationId', async (req, res, next) => {
  try {
    const { question, history } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    // NEW: Optional bounded user-only history supports follow-ups without adding conversation storage or schema.
    const safeHistory = Array.isArray(history)
      ? history
          .filter((turn) => turn?.role === 'user' && typeof turn.content === 'string')
          .map((turn) => ({ role: 'user', content: turn.content.slice(0, 1000) }))
          .slice(-4)
      : [];

    let application = await Application.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!canAccessChatApplication(req.user, application)) {
      // Use the same response as an unknown ID so chat cannot be used to
      // enumerate another applicant's application IDs.
      return res.status(404).json({ error: 'Application not found' });
    }

    // Officer chat can refer to a different borrower by name. Resolve only an
    // exact known applicant name from MongoDB, then ground the answer in that
    // person's application and documents instead of the currently open record.
    const questionName = normalizeName(question);
    const knownNames = await Application.distinct('applicantName');
    const mentionedNames = knownNames
      .filter((name) => {
        const normalized = normalizeName(name);
        return normalized && (` ${questionName} `).includes(` ${normalized} `);
      })
      .sort((a, b) => normalizeName(b).length - normalizeName(a).length);

    if (req.user.role === 'officer') {
      if (mentionedNames.length > 1) {
        return res.json({
          answer: 'Your question mentions more than one applicant. Please ask about one applicant at a time.',
          sources: [],
        });
      }
      if (mentionedNames.length === 1) {
        const matchingApplications = await Application.find({ applicantName: mentionedNames[0] })
          .sort({ createdAt: -1 });
        if (matchingApplications.length > 1) {
          return res.json({
            answer: `${mentionedNames[0]} has multiple applications. Please open the specific application you want to ask about.`,
            sources: [],
          });
        }
        if (matchingApplications.length === 1) application = matchingApplications[0];
      } else if (hasUnmatchedPersonReference(question)) {
        return res.json({
          answer: 'I could not find an application matching the name in your question. Check the spelling or choose the applicant from the applications list.',
          sources: [],
        });
      }
    } else {
      const currentApplicant = normalizeName(application.applicantName);
      if (mentionedNames.some((name) => normalizeName(name) !== currentApplicant)
        || (mentionedNames.length === 0 && hasUnmatchedPersonReference(question))) {
        return res.json({
          answer: 'I can only provide application details linked to your account. Please contact your loan officer about another applicant.',
          sources: [],
        });
      }
    }

    // NEW: Cancel Ollama/Chroma HTTP calls if the client disconnects mid-request.
    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
    const result = await answerQuestion({ question, application, role: req.user.role, history: safeHistory, signal: abortController.signal });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
