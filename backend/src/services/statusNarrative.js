import { currentDocuments, missingDocuments, openExceptions } from './verification.js';
import { borrowerExplanation } from './borrowerWording.js';

// "Where do I stand?" written out in full: what is done, what is wrong and exactly what to do about
// it, what happens next, and what has happened so far. It is plain text with a tiny markup
// (## heading, **bold**, - bullet, > callout) so the same words work in every channel: the web chat
// renders the markup (AnswerText.js) and a messaging channel such as WhatsApp turns it into that
// channel's own formatting with toWhatsApp(). Nothing here calls a language model.
//
// A borrower gets only what the borrower may see (their own steps, edits and the decision notice);
// credit scores, internal notes and the underwriter record stay staff-only.

const DOC_LABEL = {
  'pay-stub': 'Pay stub',
  w2: 'W-2',
  'bank-statement': 'Bank statement',
  'drivers-license': "Driver's license",
  'business-tax-return': 'Business tax return',
  'personal-financial-statement': 'Personal financial statement',
  'business-license': 'Business license',
  'ownership-disclosure': 'Ownership disclosure',
};
const PRODUCT_LABEL = { 'auto-loan': 'Auto loan', 'personal-loan': 'Personal loan', 'small-business-loan': 'Small business loan' };
const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const docLabel = (type) => DOC_LABEL[type] || titleCase(type);
const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const STAFF_STATUS = { submitted: 'Submitted', 'needs-review': 'Needs review', referred: 'With the underwriter', approved: 'Approved', rejected: 'Declined' };
const BORROWER_STATUS = { submitted: 'Received', 'needs-review': 'Needs your attention', referred: 'Under senior review', approved: 'Approved', rejected: 'Not approved' };

// What the borrower should DO about each kind of flag. Falls back to the check's own explanation.
const FIX = {
  'ID expiry': (docName) => `Please upload a current (not expired) ${docName.toLowerCase()}.`,
  'Document type': () => 'Please upload the correct type of document for this item.',
  'Document quality': (docName) => `Please upload a clearer, complete photo or scan of your ${docName.toLowerCase()}.`,
  Name: () => "The name on the document does not match your application. Upload the right document, or ask your loan officer to correct the name.",
};
const DETAIL_FIX = 'If a detail on your application is wrong, correct it with Edit application. If the document is wrong, upload the right one.';

function exceptionLines(exceptions, borrower) {
  const lines = [];
  for (const e of exceptions) {
    const name = docLabel(e.docType);
    if (e.type === 'missing') {
      lines.push(`- **${name}** - not uploaded yet. Please upload it.`);
      continue;
    }
    for (const c of e.checks || []) {
      // Stored explanations are written for the officer; a borrower gets the same finding addressed to them.
      const text = borrower ? borrowerExplanation(c) : c.explanation;
      const ask = borrower ? FIX[c.field]?.(name) : null;
      // Some explanations already end with the ask ("... please upload a current ID."); don't repeat it.
      lines.push(`- **${name}** - ${text}${ask && !/upload/i.test(text) ? ` ${ask}` : ''}`);
    }
  }
  return lines;
}

// The review record as a short, dated list. Borrowers see their own steps only.
function activity({ application, documents, borrower }) {
  const items = [];
  for (const e of application.reviewHistory || []) {
    const who = e.actor?.name ? ` by ${e.actor.name}` : '';
    const at = e.at;
    switch (e.action) {
      case 'submitted':
        items.push({ at, text: 'Application submitted' });
        break;
      case 'application-edited':
        items.push({ at, text: `Application details corrected${who}`, sub: (e.details?.changes || []).map((c) => `${c.label}: ${c.kind === 'money' ? money(c.from) : c.from ?? 'blank'} -> ${c.kind === 'money' ? money(c.to) : c.to ?? 'blank'}`) });
        break;
      case 'refer':
        items.push({ at, text: borrower ? 'Sent for senior review' : `Referred to the underwriter${who}`, sub: !borrower && e.note ? [`"${e.note}"`] : [] });
        break;
      case 'return':
        if (!borrower) items.push({ at, text: `Returned to the loan officer${who}`, sub: e.note ? [`"${e.note}"`] : [] });
        else items.push({ at, text: 'Review continued with your loan officer' });
        break;
      case 'approve':
        items.push({ at, text: borrower ? 'Application approved' : `Approved${who}`, sub: !borrower && e.details?.waivedParameters?.length ? [`Waived: ${e.details.waivedParameters.map(titleCase).join(', ')}`] : [] });
        break;
      case 'reject':
        items.push({ at, text: borrower ? 'Decision recorded: not approved' : `Declined${who}`, sub: !borrower && e.note ? [`"${e.note}"`] : [] });
        break;
      case 'credit-score-entered':
        if (!borrower) items.push({ at, text: `Credit score recorded${who}` });
        break;
      case 'verification-run':
        if (!borrower) items.push({ at, text: `Identity and credit checks run${who}` });
        break;
      default:
        break;
    }
  }
  for (const d of documents) {
    const label = docLabel(d.docType);
    items.push({ at: d.createdAt, text: `${label} ${d.status === 'superseded' ? 'uploaded (replaced by a newer upload)' : 'uploaded'}` });
  }
  return items.filter((i) => i.at).sort((a, b) => new Date(a.at) - new Date(b.at));
}

// application: full record (with reviewHistory/decision); documents: all of its documents.
// role: 'borrower' or any staff role. compact: just the headline, what needs action and what is next.
export function buildStatusNarrative({ application, documents = [], role = 'borrower', compact = false }) {
  const borrower = role === 'borrower';
  const current = currentDocuments(documents);
  const missing = missingDocuments(application, documents);
  const exceptions = openExceptions(application, documents);
  const flaggedChecks = current.flatMap((d) => (d.verification?.checks || []).filter((c) => c.status === 'mismatch' || c.status === 'warning'));
  const allChecks = current.flatMap((d) => d.verification?.checks || []);
  const status = application.status;
  const decided = status === 'approved' || status === 'rejected';
  const required = application.requiredDocTypes || [];
  const subject = borrower ? 'Your application' : application.applicantName;
  const statusLabel = (borrower ? BORROWER_STATUS : STAFF_STATUS)[status] || titleCase(status);

  const out = [`## ${subject} - ${statusLabel}`];
  out.push(`${PRODUCT_LABEL[application.productType] || titleCase(application.productType)} - ${money(application.requestedAmount)}${application.repaymentTermMonths ? ` over ${application.repaymentTermMonths} months` : ''}`);

  // Outcome first when there is one.
  if (decided) {
    const d = application.decision || {};
    if (status === 'approved') {
      out.push(`> ${borrower ? 'Your loan has been approved.' : `Approved${d.decidedBy?.name ? ` by ${d.decidedBy.name}` : ''}${d.decidedAt ? ` on ${day(d.decidedAt)}` : ''}.`}`);
      if (borrower && d.conditions?.length) out.push(['**Conditions:**', ...d.conditions.map((c) => `- ${c}`)].join('\n'));
    } else {
      out.push(`> ${borrower ? 'We are unable to approve your application at this time.' : `Declined${d.decidedBy?.name ? ` by ${d.decidedBy.name}` : ''}${d.decidedAt ? ` on ${day(d.decidedAt)}` : ''}.`}`);
      if (d.reason) out.push(`**Reason:** ${d.reason}`);
    }
  }

  const needsAction = exceptions.length > 0;

  if (!compact) {
    const checksLine = allChecks.length
      ? `${plural(allChecks.length, 'check')} run, ${allChecks.length - flaggedChecks.length} matched${flaggedChecks.length ? `, ${flaggedChecks.length} need${flaggedChecks.length === 1 ? 's' : ''} attention` : ''}`
      : 'runs automatically after each upload';
    const allIn = required.length > 0 && missing.length === 0;
    const steps = [
      `- [x] Application submitted${application.createdAt ? ` - ${day(application.createdAt)}` : ''}`,
      `- [${allIn ? 'x' : needsAction && missing.length ? '!' : ' '}] Documents received - ${required.length - missing.length} of ${required.length}${current.length ? ` (${[...new Set(current.map((d) => docLabel(d.docType)))].join(', ')})` : ''}`,
      `- [${allIn && allChecks.length ? 'x' : ' '}] Automated checks - ${checksLine}`,
      `- [${decided ? 'x' : needsAction ? '!' : status === 'referred' ? 'x' : ' '}] ${borrower ? 'Issues to fix' : 'Open issues'} - ${needsAction ? plural(exceptions.length, 'item') + ' to resolve' : 'none'}`,
      `- [${decided ? 'x' : ' '}] ${status === 'referred' ? 'Senior review - with the underwriter' : 'Review - ' + (decided ? 'completed' : needsAction ? 'starts once the issues are resolved' : 'waiting for a loan officer')}`,
      `- [${decided ? 'x' : ' '}] Decision - ${decided ? (status === 'approved' ? 'approved' : borrower ? 'not approved' : 'declined') : 'pending'}`,
    ];
    out.push(['**Where things stand**', ...steps].join('\n'));
  }

  if (needsAction) {
    out.push([`**${borrower ? 'What you need to do' : 'Needs action'}**`, ...exceptionLines(exceptions, borrower)].join('\n'));
    if (borrower && exceptions.some((e) => e.type === 'flagged' && (e.checks || []).some((c) => !FIX[c.field] && borrowerExplanation(c) === c.explanation))) out.push(DETAIL_FIX);
  }

  // What happens next.
  let next;
  if (decided) next = status === 'approved' ? 'Your loan officer will contact you about the next steps.' : 'If you have questions about this decision, please contact your loan officer.';
  else if (status === 'referred') next = borrower ? 'A senior underwriter is reviewing your file. Nothing is needed from you right now.' : 'The underwriter is reviewing this file.';
  else if (needsAction) next = borrower ? 'Once you have fixed the items above, your documents are re-checked straight away and your loan officer can review.' : 'Resolve the items above, then the loan officer can review.';
  else next = borrower ? 'Everything we need is in. A loan officer will review your application and make a decision.' : 'All checks are clear. The loan officer can review and decide.';
  out.push(`> Next: ${next}`);

  if (!compact) {
    const history = activity({ application, documents, borrower });
    if (history.length) {
      out.push(['**Recent activity**', ...history.slice(-8).flatMap((h) => [`- ${day(h.at)} - ${h.text}`, ...(h.sub || []).map((s) => `  ${s}`)])].join('\n'));
    }
  }

  return { text: out.join('\n\n'), status, needsAction, openItems: exceptions.length };
}

// Markdown-lite -> WhatsApp formatting (*bold*, bullets as dots, ticks for steps). Kept here so the
// words stay identical across channels and only the markup changes.
export function toWhatsApp(text) {
  return String(text)
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^> ?/gm, '')
    .replace(/^- \[x\] /gm, '✅ ')
    .replace(/^- \[!\] /gm, '⚠️ ')
    .replace(/^- \[ \] /gm, '◻️ ')
    .replace(/^- /gm, '• ');
}
