import { redactText } from './redaction.js';

// Turns a feedback request into the record that is stored: validated, trimmed and redacted.
// Pure, so it can be tested without a database.
const clip = (value, n) => String(value ?? '').slice(0, n);

export function buildFeedbackRecord({ body = {}, user, applicationId, retrievalMode = 'dense' }) {
  if (!['up', 'down'].includes(body.rating)) return { error: 'rating must be "up" or "down"' };
  const question = clip(body.question, 2000).trim();
  const answer = clip(body.answer, 4000).trim();
  if (!question || !answer) return { error: 'question and answer are required' };
  const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 8).map((s) => ({
    doc: clip(s?.doc, 120),
    section: clip(s?.section, 120),
    source: clip(s?.source, 120),
    kind: ['file', 'policy'].includes(s?.kind) ? s.kind : undefined,
  }));
  return {
    record: {
      applicationId,
      role: user?.role === 'borrower' ? 'borrower' : 'staff',
      rating: body.rating,
      comment: redactText(clip(body.comment, 500)).trim() || undefined,
      question: redactText(question),
      answer: redactText(answer),
      sources,
      promptVersion: clip(body.promptVersion, 40) || undefined,
      retrievalMode,
    },
  };
}

// Rated-down answers as skeletons for the golden set: the question is real, the expected facts and
// source still have to be written by a person who knows the right answer.
export function goldenCandidates(feedbackRows) {
  return feedbackRows.map((f) => ({
    id: `FB-${String(f._id).slice(-6)}`,
    category: 'feedback',
    question: f.question,
    persona: { role: f.role === 'borrower' ? 'borrower' : 'officer', applicant: 'FILL IN' },
    expect: { behavior: 'FILL IN', sources: f.sources.map((s) => s.source).filter(Boolean) },
    needsReview: true,
    note: f.comment || 'Rated down. Write the expected facts and the source, then add it to data/eval/golden-questions-v2.json.',
    answerGiven: f.answer.slice(0, 400),
  }));
}
