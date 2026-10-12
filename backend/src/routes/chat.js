import { Router } from 'express';
import Application from '../models/Application.js';
import { requireAuth } from '../middleware/auth.js';
import { answerQuestion } from '../services/rag.js';
import { canAccessChatApplication } from '../services/chatAccess.js';

const router = Router();
router.use(requireAuth);

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

    const application = await Application.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!canAccessChatApplication(req.user, application)) {
      return res.status(403).json({ error: 'Not your application' });
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
