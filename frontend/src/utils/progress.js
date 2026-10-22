import { labelize } from '../theme';
import { checkStats } from '../components/VerificationSummary';

// Derives "where is this application?" from data the server already returns
// (documents, required types, open exceptions, status) — no extra backend
// state. The Progress page and the chat assistant both use this, so what the
// assistant says about progress always matches what the page shows.
export function computeProgress(app) {
  const docs = (app.documents || []).filter((d) => (d.status || 'current') === 'current');
  const required = app.requiredDocTypes || [];
  const received = required.filter((t) => docs.some((d) => d.docType === t));
  const missing = required.filter((t) => !received.includes(t));
  const exceptions = app.openExceptions || [];
  const stats = checkStats(docs);
  const decided = app.status === 'approved' || app.status === 'rejected';
  const allReceived = required.length > 0 && missing.length === 0;
  const clean = allReceived && exceptions.length === 0;

  const steps = [
    {
      key: 'submitted',
      title: 'Application submitted',
      detail: `${labelize(app.productType)} · $${Number(app.requestedAmount || 0).toLocaleString('en-US')} requested`,
      done: true,
      tab: null,
    },
    {
      key: 'documents',
      title: 'Documents uploaded',
      detail: `${received.length} of ${required.length} required documents received`,
      done: allReceived,
      tab: 'documents',
    },
    {
      key: 'verification',
      title: 'Automated verification',
      detail: stats.total
        ? `${stats.total} checks run · ${stats.passed} matched · ${stats.flagged} flagged`
        : 'Runs automatically after each upload',
      done: allReceived && stats.total > 0,
      tab: 'verification',
    },
    {
      key: 'issues',
      title: 'Issues resolved',
      detail: exceptions.length
        ? `${exceptions.length} item${exceptions.length === 1 ? '' : 's'} need${exceptions.length === 1 ? 's' : ''} action`
        : 'No open issues',
      done: clean,
      attention: exceptions.length > 0,
      tab: 'action-needed',
    },
    {
      key: 'review',
      title: 'Officer review',
      detail: decided ? 'Review completed' : clean ? 'Waiting for a loan officer to review' : 'Starts once all issues are resolved',
      done: decided,
      tab: null,
    },
    {
      key: 'decision',
      title: 'Decision',
      detail: decided ? labelize(app.status) : 'Pending',
      done: decided,
      tab: null,
    },
  ];

  const currentIndex = steps.findIndex((s) => !s.done);
  const current = currentIndex === -1 ? steps[steps.length - 1] : steps[currentIndex];
  const doneCount = steps.filter((s) => s.done).length;

  let next;
  if (decided) next = `The application was ${app.status}.`;
  else if (missing.length) next = `Upload the remaining document${missing.length === 1 ? '' : 's'}: ${missing.map(labelize).join(', ')}.`;
  else if (exceptions.length) next = `Resolve ${exceptions.length} open item${exceptions.length === 1 ? '' : 's'} (see Action Needed).`;
  else next = 'A loan officer will review the application and make a decision.';

  return {
    steps,
    current,
    percent: Math.round((doneCount / steps.length) * 100),
    doneCount,
    next,
    missing,
    exceptions,
    stats,
    docs,
  };
}
