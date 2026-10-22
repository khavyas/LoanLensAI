import { currentDocuments, missingDocuments } from './verification.js';
import {
  CREDIT_SCORE_RANGE,
  MIN_CREDIT_SCORE,
  MIN_JUSTIFICATION_CHARS,
  WAIVABLE_PARAMETERS,
} from '../config/underwriting.js';

// Pure functions (no database access) so every rule can be unit-tested.

const IDENTITY_FIELDS = ['Name', 'SSN (last 4)', 'Document type', 'Ownership percentage', 'Business name'];
const INCOME_FIELDS = ['Monthly income', 'Annual business revenue'];

// "Does this file meet the bank's parameters?" — the question a loan officer
// answers before approving, and the list an underwriter weighs when deciding
// whether to grant an exception. Each parameter is met, unmet or pending
// (pending = a human still has to enter something).
export function assessApplication(application, documents) {
  const current = currentDocuments(documents);
  const checks = current.flatMap((d) => d.verification?.checks || []);
  const mismatches = (fields) => checks.filter((c) => c.status === 'mismatch' && fields.includes(c.field));
  const missing = missingDocuments(application, documents);
  const parameters = [];

  parameters.push({
    key: 'documents',
    label: 'Required documents',
    status: missing.length ? 'unmet' : 'met',
    waivable: false,
    detail: missing.length ? `${missing.length} still missing` : 'All required documents received',
  });

  const identity = mismatches(IDENTITY_FIELDS);
  parameters.push({
    key: 'identity',
    label: 'Identity and entity consistency',
    status: identity.length ? 'unmet' : 'met',
    waivable: false,
    detail: identity.length
      ? `Mismatch on ${[...new Set(identity.map((c) => c.field))].join(', ')}`
      : 'Name, SSN and entity details agree across documents',
  });

  const income = mismatches(INCOME_FIELDS);
  parameters.push({
    key: 'income',
    label: 'Stated income matches documents',
    status: income.length ? 'unmet' : 'met',
    waivable: false,
    detail: income.length
      ? `Mismatch on ${[...new Set(income.map((c) => c.field))].join(', ')} — borrower must correct or prove it`
      : 'Documented income is within tolerance of the stated income',
  });

  const min = MIN_CREDIT_SCORE[application.productType];
  const score = application.creditProfile?.score;
  parameters.push({
    key: 'credit-score',
    label: 'Credit score',
    status: score == null ? 'pending' : score >= min ? 'met' : 'unmet',
    waivable: true,
    detail:
      score == null
        ? `Not entered yet (minimum ${min})`
        : `Score ${score} against a minimum of ${min}`,
  });

  const affordability = checks.find((c) => c.field === 'Requested amount vs. affordability');
  parameters.push({
    key: 'affordability',
    label: 'Requested amount is affordable',
    status: affordability && affordability.status !== 'match' ? 'unmet' : 'met',
    waivable: true,
    detail: affordability
      ? affordability.status === 'match'
        ? 'Within the estimated affordable range'
        : affordability.found + ' vs ' + affordability.expected
      : 'Not assessed yet — no income document',
  });

  const unmet = parameters.filter((p) => p.status === 'unmet');
  const pending = parameters.filter((p) => p.status === 'pending');
  return {
    parameters,
    unmetKeys: unmet.map((p) => p.key),
    // Everything satisfied: a loan officer may approve on their own authority.
    canApprove: unmet.length === 0 && pending.length === 0,
    // Only waivable parameters are short and nothing is waiting on data entry:
    // this file is a candidate for an underwriter exception.
    canRefer: unmet.length > 0 && unmet.every((p) => p.waivable) && pending.length === 0,
    // Fix-it list: what stops the file from being approved or referred.
    blockers: [...unmet.filter((p) => !p.waivable), ...pending],
  };
}

// Only whoever currently holds the file may change the score it is judged on:
// the loan officer before referral, the underwriter while it is referred.
export function canEnterCreditScore(user, application) {
  if (user.role === 'officer') return ['submitted', 'needs-review'].includes(application.status);
  if (user.role === 'underwriter') return application.status === 'referred';
  return false;
}

export function validateCreditScore(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < CREDIT_SCORE_RANGE.min || score > CREDIT_SCORE_RANGE.max) {
    return { error: 422, message: `Credit score must be a whole number from ${CREDIT_SCORE_RANGE.min} to ${CREDIT_SCORE_RANGE.max}.` };
  }
  return { score };
}

const FINAL = ['approved', 'rejected'];
const fail = (error, message) => ({ error, message });
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const lines = (v) =>
  (Array.isArray(v) ? v : String(v || '').split('\n')).map((s) => String(s).trim()).filter(Boolean);

// Decides what a user may do to an application right now. Returns either
// { error, message } or { status, decision?, event } for the route to persist.
//
//   loan officer : approve (only if every parameter is met) | reject | refer
//   underwriter  : approve (may waive WAIVABLE parameters, with reasons) | reject | return
export function evaluateDecision({ user, application, assessment, body = {} }) {
  const action = body.action;
  const note = text(body.note);
  const actor = { name: user.name, email: user.email, role: user.role };
  const event = (details = {}) => ({ at: new Date(), actor, action, note, details });

  if (FINAL.includes(application.status)) {
    return fail(409, `This application is already ${application.status}; the decision cannot be changed.`);
  }

  if (user.role === 'officer') {
    if (!['submitted', 'needs-review'].includes(application.status)) {
      return fail(409, 'This application is with the underwriter, not in loan-officer review.');
    }
    if (action === 'approve') {
      if (!assessment.canApprove) {
        return fail(422, assessment.canRefer
          ? 'Parameters are not met, so you cannot approve this yourself. Refer it to the underwriter for an exception.'
          : 'Parameters are not met and cannot be waived. Resolve the blocking items first.');
      }
      return { status: 'approved', decision: { outcome: 'approved', exception: null, reason: note }, event: event() };
    }
    if (action === 'reject') {
      if (note.length < 10) return fail(422, 'Give the specific reason(s) for declining — they go to the borrower.');
      return { status: 'rejected', decision: { outcome: 'rejected', exception: null, reason: note }, event: event() };
    }
    if (action === 'refer') {
      if (!assessment.canRefer) {
        return fail(422, assessment.blockers.length
          ? 'This file has blocking items that an underwriter cannot waive. Resolve them first.'
          : 'All parameters are met — approve it directly instead of referring it.');
      }
      if (note.length < MIN_JUSTIFICATION_CHARS) {
        return fail(422, `Explain why this borrower deserves an exception (at least ${MIN_JUSTIFICATION_CHARS} characters).`);
      }
      return {
        status: 'referred',
        event: event({
          unmetParameters: assessment.unmetKeys,
          relationshipNote: text(body.relationshipNote),
        }),
      };
    }
    return fail(400, "A loan officer's action must be approve, reject or refer.");
  }

  if (user.role === 'underwriter') {
    if (application.status !== 'referred') {
      return fail(409, 'Only applications referred by a loan officer are in underwriter review.');
    }
    if (action === 'approve') {
      const waived = Array.isArray(body.waivedParameters) ? body.waivedParameters : [];
      if (assessment.blockers.length) {
        return fail(422, 'This file has blocking items that cannot be waived: ' + assessment.blockers.map((p) => p.label).join(', ') + '.');
      }
      const notWaivable = waived.filter((k) => !WAIVABLE_PARAMETERS.includes(k));
      if (notWaivable.length) return fail(422, `These parameters cannot be waived: ${notWaivable.join(', ')}.`);
      const uncovered = assessment.unmetKeys.filter((k) => !waived.includes(k));
      if (uncovered.length) return fail(422, `Name every unmet parameter you are waiving. Not yet covered: ${uncovered.join(', ')}.`);
      const compensatingFactors = text(body.compensatingFactors);
      if (assessment.unmetKeys.length && compensatingFactors.length < MIN_JUSTIFICATION_CHARS) {
        return fail(422, `Record the compensating factors that justify the exception (at least ${MIN_JUSTIFICATION_CHARS} characters).`);
      }
      const exception = assessment.unmetKeys.length
        ? {
            waivedParameters: assessment.unmetKeys,
            compensatingFactors,
            relationshipNote: text(body.relationshipNote),
            conditions: lines(body.conditions),
          }
        : null;
      return {
        status: 'approved',
        decision: { outcome: 'approved', exception, conditions: lines(body.conditions), reason: note },
        event: event(exception ? { waivedParameters: exception.waivedParameters } : {}),
      };
    }
    if (action === 'reject') {
      if (note.length < 10) return fail(422, 'Give the specific reason(s) for declining — they go to the borrower.');
      return { status: 'rejected', decision: { outcome: 'rejected', exception: null, reason: note }, event: event() };
    }
    if (action === 'return') {
      if (note.length < 10) return fail(422, 'Tell the loan officer what is needed before you can decide.');
      return { status: 'needs-review', event: event() };
    }
    return fail(400, "An underwriter's action must be approve, reject or return.");
  }

  return fail(403, 'Only a loan officer or an underwriter can record a decision.');
}

// What the borrower is allowed to see: the outcome and plain-language reasons
// or conditions — never the internal exception rationale, the relationship
// note, the credit score entry, or who referred what.
export function borrowerNotice(application) {
  const decision = application.decision;
  if (!decision?.outcome) return null;
  if (decision.outcome === 'approved') {
    return {
      outcome: 'approved',
      message: 'Your loan has been approved.',
      conditions: decision.conditions || [],
    };
  }
  return {
    outcome: 'rejected',
    message: 'We are unable to approve your application at this time.',
    reasons: decision.reason,
    // Template wording only — have compliance review it before real use.
    notice:
      'Under the Equal Credit Opportunity Act you are entitled to a statement of the specific reasons for this decision. ' +
      'The bank does not discriminate on the basis of race, color, religion, national origin, sex, marital status, age, ' +
      'receipt of public assistance, or good-faith exercise of rights under the Consumer Credit Protection Act.',
  };
}
