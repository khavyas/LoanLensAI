import { assessApplication } from './decisionRules.js';

// "Why was this file forwarded to me?" asked by staff. The answer comes from the review record (who
// referred it, when, and the note they wrote) and from the approval requirements that are not met today,
// so it is exact and needs no model. Borrowers never get this: referral notes are internal.

const REFERRAL = /\b(forward\w*|referr?\w*|escalat\w*|sent|assign\w*|route\w*|pass(?:ed)?)\b/i;
const WHY = /\b(why|reason|because|what\s+(?:is|was)\s+the\s+issue|what\s+happened)\b/i;
const STAFF = new Set(['officer', 'underwriter']);

export const isReferralReasonQuestion = (q) => REFERRAL.test(String(q || '')) && WHY.test(String(q || ''));

export function referralReasonAnswer(question, application, documents = [], role) {
  if (!STAFF.has(role) || !isReferralReasonQuestion(question)) return null;
  const history = application.reviewHistory || [];
  const entry = [...history].reverse().find((e) => e.action === 'refer');
  if (!entry && application.status !== 'referred') return null;

  const unmet = assessApplication(application, documents).parameters.filter((p) => p.status === 'unmet');
  const when = entry?.at ? new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const who = entry?.actor?.name || 'The loan officer';
  const lines = [];
  if (unmet.length) {
    lines.push(`This file was referred to the underwriter because of: ${unmet.map((p) => `${p.label.toLowerCase()} (${String(p.detail || '').replace(/\s*\(simulated\)\s*$/, '')})`).join('; ')}.`);
  } else {
    lines.push('This file was referred to the underwriter for review.');
  }
  lines.push(`Referred by ${who}${when ? ` on ${when}` : ''}.`);
  if (entry?.note) lines.push(`Officer's note: "${entry.note}"`);
  if (unmet.some((p) => p.waivable)) lines.push('An underwriter can waive this with compensating factors.');
  return { answer: lines.join('\n'), sources: [{ doc: 'Review history' }, { doc: 'Approval requirements' }] };
}
