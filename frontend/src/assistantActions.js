import { api } from './api/client';
import { labelize } from './theme';
import { APP_TABS } from './navigationRef';
import { computeProgress } from './utils/progress';
import { resolveNamedApplicant } from './utils/applicantNames';

// Deterministic "take me there" intents for the chat. Questions about the
// application's own state (what's uploaded, progress, checks, open items) are
// answered from the application's real data and open the matching page — no
// language model involved, so they are instant, can't hallucinate, and work
// even when AI credits are exhausted. Everything else (policy questions, ...)
// falls through to the normal assistant.
const INTENTS = [
  {
    // Staff only: referral, exception and credit-score questions open the Decision page.
    tab: 'decision',
    staffOnly: true,
    test: /\b(referred|refer(?:ral)?|exception|underwriter|waive\w*|credit score|parameters?|who (?:decided|approved))\b/i,
  },
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

const isBorrower = (role) => role === 'borrower';

// Who an answer is about: a borrower only ever sees their own application;
// staff may be told about someone else's, so the heading names the applicant.
const owner = (role, app) => (isBorrower(role) ? 'Your application' : app.applicantName);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Answers use a small markdown-like format (## heading, - bullet, > callout,
// **bold**) that components/AnswerText.js renders, so they can be scanned.

function documentsAnswer(role, app, p) {
  const head = isBorrower(role) ? 'Your documents' : `${app.applicantName} — documents`;
  const still = p.missing.length
    ? `> Still needed: ${p.missing.map((t) => `**${labelize(t)}**`).join(', ')}`
    : '> All required documents are in.';
  if (!p.docs.length) return `## ${head}\nNo documents have been uploaded yet.\n${still}`;
  const rows = p.docs.map(
    (d) => `- **${labelize(d.docType)}** · ${d.fileName || 'file'} — **${RESULT[d.verification?.overall] || 'Pending'}**`
  );
  return `## ${head} — ${plural(p.docs.length, 'document')} uploaded\n${rows.join('\n')}\n${still}`;
}

function progressAnswer(role, app, p) {
  return [
    `## ${owner(role, app)} — **${p.percent}%** complete`,
    `${p.doneCount} of ${p.steps.length} steps done. Currently at **${p.current.title}** — ${p.current.detail}.`,
    `> Next step: ${p.next}`,
  ].join('\n');
}

function verificationAnswer(role, app, p) {
  const s = p.stats;
  const head = `## ${owner(role, app)} — verification`;
  if (!s.total) return `${head}\nNo checks have run yet — they run automatically after each document is uploaded.`;
  return [
    head,
    `- **${s.total}** checks run`,
    `- **${s.passed}** **matched**`,
    s.flagged ? `- **${s.flagged}** **flagged**` : '- **0** flagged',
    `${s.fields} fields were extracted from the documents.`,
    '> Open the Verification page to see every parameter, with the expected value next to the value found.',
  ].join('\n');
}

const when = (d) => (d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '');

// Where the file stands in the officer -> underwriter flow, from the review
// record the server returned to staff.
function decisionAnswer(role, app) {
  const a = app.assessment;
  const unmet = (a?.parameters || []).filter((p) => p.status !== 'met');
  const history = app.reviewHistory || [];
  const last = history[history.length - 1];
  const gapRows = unmet.map((p) => `- **${p.label}** — ${p.detail}`);

  if (app.status === 'approved' || app.status === 'rejected') {
    const d = app.decision || {};
    const lines = [
      `## ${app.applicantName} — **${labelize(app.status)}**`,
      `Decided by ${d.decidedBy?.name || 'staff'} (${d.decidedBy?.role || 'staff'}) on ${when(d.decidedAt)}.`,
    ];
    if (d.exception) {
      lines.push(`> Approved as an exception — waived: ${d.exception.waivedParameters.map((k) => `**${labelize(k)}**`).join(', ')}`);
      lines.push(`Compensating factors: ${d.exception.compensatingFactors}`);
    }
    return lines.join('\n');
  }
  if (app.status === 'referred') {
    const ref = [...history].reverse().find((e) => e.action === 'refer');
    return [
      `## ${app.applicantName} — **Referred to the underwriter**`,
      `Referred by ${ref?.actor?.name || 'the loan officer'}${ref?.note ? `: "${ref.note}"` : ''}.`,
      gapRows.length ? `**Not met:**\n${gapRows.join('\n')}` : 'Every parameter is met.',
    ].join('\n');
  }
  const next = a?.canApprove
    ? 'The loan officer can approve it.'
    : a?.canRefer
      ? 'It can be referred to an underwriter for an exception.'
      : 'It cannot be approved or referred until the blocking items are resolved.';
  return [
    `## ${app.applicantName} — decision status`,
    gapRows.length ? `**Not met:**\n${gapRows.join('\n')}` : 'Every parameter is **met**.',
    `> ${next}${last ? ` Last activity: ${last.action} by ${last.actor?.name}.` : ''}`,
  ].join('\n');
}

function actionNeededAnswer(role, app, p) {
  if (!p.exceptions.length) {
    return `## ${owner(role, app)} — **Nothing needs action**\nEvery required document is uploaded and all checks are clear.`;
  }
  const rows = p.exceptions.map((e) => {
    const what = e.type === 'missing' ? '**Not uploaded yet**' : (e.checks || []).map((c) => c.field).join(', ');
    return `- **${labelize(e.docType)}** — ${what}`;
  });
  return `## ${owner(role, app)} — ${plural(p.exceptions.length, 'item')} need${p.exceptions.length === 1 ? 's' : ''} action\n${rows.join('\n')}`;
}

// Resolves to { answer, sources, tab, label } when the question is an
// application-state intent, or null to let the normal assistant answer.
export async function handleLocalIntent(question, application, role) {
  const intent = INTENTS.find((i) => (!i.staffOnly || role !== 'borrower') && i.test.test(question));
  if (!intent) return null;

  // Whose application is the question about? The open one — unless a name is
  // mentioned. Staff can see everyone, so a named applicant (in any letter
  // case: "priya's status") is looked up and answered, and the chat opens THAT
  // application. Anything unclear (unknown name, several people, a name with
  // several applications) goes to the server, which says why.
  let targetId = application._id;
  if (isBorrower(role)) {
    // A borrower can only see their own file; a capitalised name that is not
    // theirs is for the server to refuse.
    if (NAME_LIKE.test(question)) return null;
  } else {
    const who = resolveNamedApplicant(question, application, await api.applications());
    if (who.kind === 'defer') return null;
    if (who.kind === 'other') targetId = who.application._id;
  }

  // Always read the full, current application — the list the chat was given
  // doesn't carry documents or open exceptions.
  const app = await api.application(targetId);
  const p = computeProgress(app);

  const answers = {
    'action-needed': () => actionNeededAnswer(role, app, p),
    progress: () => progressAnswer(role, app, p),
    documents: () => documentsAnswer(role, app, p),
    verification: () => verificationAnswer(role, app, p),
    decision: () => decisionAnswer(role, app),
  };

  return {
    answer: answers[intent.tab](),
    sources: [{ doc: 'Application state' }],
    tab: intent.tab,
    label: tabLabel(intent.tab),
    applicationId: app._id,
  };
}
