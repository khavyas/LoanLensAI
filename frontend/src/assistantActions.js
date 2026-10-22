import { api } from './api/client';
import { labelize } from './theme';
import { APP_TABS } from './navigationRef';
import { computeProgress } from './utils/progress';

// Deterministic "take me there" intents for the chat. Questions about the
// application's own state (what's uploaded, progress, checks, open items) are
// answered from the application's real data and open the matching page — no
// language model involved, so they are instant, can't hallucinate, and work
// even when AI credits are exhausted. Everything else (policy questions, ...)
// falls through to the normal assistant.
const INTENTS = [
  {
    tab: 'action-needed',
    test: /\b(still need|need to (do|upload|fix)|what(?:'s| is| are) (missing|outstanding|pending)|missing|outstanding|action needed|to[- ]?do|next step|what should i do)\b|\bwhy\b.*\b(flagged|in review|review|mismatch|rejected|declined|failed)\b/i,
  },
  {
    tab: 'progress',
    test: /\b(progress|status|stage|where (is|am|are)|how far|track|milestone|timeline of)\b/i,
  },
  {
    tab: 'documents',
    test: /\b(uploaded|submitted|attached)\b.*\bdocuments?\b|\bdocuments?\b.*\b(uploaded|submitted|attached|on file|received)\b|\b(show|list|see|view|open)\b.*\bdocuments?\b|\bwhich documents\b.*\b(have|did)\b/i,
  },
  {
    tab: 'verification',
    test: /\b(verification|checks?|matched|mismatch\w*)\b.*\b(my|this|the|pass|passed|fail|results?|done|run)\b|\b(my|this|the)\b.*\b(verification|checks|results)\b|\bwhat (was|were|has been) (checked|verified|extracted)\b/i,
  },
];

const NAME_LIKE = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/;
const RESULT = { pass: 'Passed', 'needs-review': 'Needs review', fail: 'Failed' };
const tabLabel = (key) => APP_TABS.find((t) => t.key === key)?.label || key;

function subject(role, app) {
  return role === 'officer' ? app.applicantName : 'You';
}

function documentsAnswer(role, app, p) {
  const who = subject(role, app);
  const verb = role === 'officer' ? 'has' : 'have';
  // "Still needed" goes before the numbered list — text after the last list
  // item would be rendered as part of that item.
  const still = p.missing.length ? ` Still needed: ${p.missing.map(labelize).join(', ')}.` : '';
  if (!p.docs.length) return `No documents have been uploaded yet for this application.${still}`;
  const list = p.docs
    .map((d, i) => `${i + 1}. ${labelize(d.docType)} (${d.fileName || 'file'}) — ${RESULT[d.verification?.overall] || 'Pending'}`)
    .join(' ');
  return `${who} ${verb} uploaded ${p.docs.length} document${p.docs.length === 1 ? '' : 's'}.${still} ${list}`;
}

function progressAnswer(app, p) {
  return `This application is **${p.percent}%** through the process (${p.doneCount} of ${p.steps.length} steps). Currently at: **${p.current.title}** — ${p.current.detail}. Next: ${p.next}`;
}

function verificationAnswer(p) {
  const s = p.stats;
  if (!s.total) return 'No verification checks have run yet — they run automatically after each document is uploaded.';
  return `${s.fields} fields were extracted and ${s.total} checks were run: **${s.passed}** matched and **${s.flagged}** were flagged. Open the Verification page to see every parameter, with the expected value next to the value found.`;
}

function actionNeededAnswer(p) {
  if (!p.exceptions.length) return 'Nothing needs action right now — every required document is uploaded and all checks are clear.';
  const list = p.exceptions
    .map((e, i) => {
      const what = e.type === 'missing' ? 'not uploaded yet' : (e.checks || []).map((c) => c.field).join(', ');
      return `${i + 1}. ${labelize(e.docType)} — ${what}`;
    })
    .join(' ');
  return `${p.exceptions.length} item${p.exceptions.length === 1 ? ' needs' : 's need'} action: ${list}`;
}

// Resolves to { answer, sources, tab, label } when the question is an
// application-state intent, or null to let the normal assistant answer.
export async function handleLocalIntent(question, application, role) {
  // A question naming another person ("Show Priya Nair documents") must go to
  // the server, which resolves applicants by name and enforces who may see
  // whose data — the open application is the wrong subject for it.
  if (NAME_LIKE.test(question)) return null;
  const intent = INTENTS.find((i) => i.test.test(question));
  if (!intent) return null;

  // Always read the full, current application — the list the chat was given
  // doesn't carry documents or open exceptions.
  const app = await api.application(application._id);
  const p = computeProgress(app);

  const answers = {
    'action-needed': () => actionNeededAnswer(p),
    progress: () => progressAnswer(app, p),
    documents: () => documentsAnswer(role, app, p),
    verification: () => verificationAnswer(p),
  };

  return {
    answer: answers[intent.tab](),
    sources: [{ doc: 'Application state' }],
    tab: intent.tab,
    label: tabLabel(intent.tab),
    applicationId: app._id,
  };
}
