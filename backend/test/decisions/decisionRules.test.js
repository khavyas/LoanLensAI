import test from 'node:test';
import assert from 'node:assert/strict';
import { assessApplication, borrowerNotice, canEnterCreditScore, evaluateDecision, validateCreditScore } from '../../src/services/decisionRules.js';

const officer = { name: 'Olivia Officer', email: 'o@x.test', role: 'officer' };
const underwriter = { name: 'Uma Underwriter', email: 'u@x.test', role: 'underwriter' };

const baseApp = (extra = {}) => ({
  productType: 'personal-loan',
  status: 'needs-review',
  requiredDocTypes: ['pay-stub'],
  creditProfile: { score: 700 },
  ...extra,
});
const stub = (checks = []) => ({ docType: 'pay-stub', status: 'current', verification: { checks, overall: 'pass' } });
const affordWarning = { field: 'Requested amount vs. affordability', status: 'warning', expected: 'Up to ~$9,000', found: '$20,000 requested' };

const assess = (app, docs) => assessApplication(app, docs);
const decide = (user, app, docs, body) => evaluateDecision({ user, application: app, assessment: assess(app, docs), body });

test('a clean file with a good score can be approved by the loan officer', () => {
  const app = baseApp();
  const a = assess(app, [stub()]);
  assert.equal(a.canApprove, true);
  assert.equal(decide(officer, app, [stub()], { action: 'approve' }).status, 'approved');
});

test('a low credit score blocks officer approval but allows a referral', () => {
  const app = baseApp({ creditProfile: { score: 580 } });
  const a = assess(app, [stub()]);
  assert.equal(a.canApprove, false);
  assert.equal(a.canRefer, true);
  assert.deepEqual(a.unmetKeys, ['credit-score']);
  assert.match(decide(officer, app, [stub()], { action: 'approve' }).message, /Refer it to the underwriter/);
});

test('an affordability warning is also a waivable shortfall', () => {
  const app = baseApp();
  const a = assess(app, [stub([affordWarning])]);
  assert.deepEqual(a.unmetKeys, ['affordability']);
  assert.equal(a.canRefer, true);
});

test('a missing credit score is pending, not met — nothing proceeds until it is entered', () => {
  const app = baseApp({ creditProfile: undefined });
  const a = assess(app, [stub()]);
  assert.equal(a.canApprove, false);
  assert.equal(a.canRefer, false);
  assert.equal(a.parameters.find((p) => p.key === 'credit-score').status, 'pending');
});

test('an identity mismatch can never be referred or waived', () => {
  const app = baseApp({ creditProfile: { score: 580 } });
  const docs = [stub([{ field: 'SSN (last 4)', status: 'mismatch' }])];
  const a = assess(app, docs);
  assert.equal(a.canRefer, false);
  assert.ok(a.blockers.some((p) => p.key === 'identity'));
  assert.equal(decide(officer, app, docs, { action: 'refer', note: 'x'.repeat(30) }).error, 422);
});

test('a missing required document blocks approval and referral', () => {
  const a = assess(baseApp(), []);
  assert.equal(a.canApprove, false);
  assert.equal(a.canRefer, false);
});

test('referring needs a real justification', () => {
  const app = baseApp({ creditProfile: { score: 580 } });
  assert.equal(decide(officer, app, [stub()], { action: 'refer', note: 'ok' }).error, 422);
  const ok = decide(officer, app, [stub()], {
    action: 'refer',
    note: 'Ten-year customer, steady employer, savings on deposit',
    relationshipNote: 'Known to branch manager',
  });
  assert.equal(ok.status, 'referred');
  assert.equal(ok.event.details.relationshipNote, 'Known to branch manager');
  assert.deepEqual(ok.event.details.unmetParameters, ['credit-score']);
});

test('a loan officer cannot refer a file that already meets every parameter', () => {
  assert.equal(decide(officer, baseApp(), [stub()], { action: 'refer', note: 'x'.repeat(30) }).error, 422);
});

test('an officer cannot act once the file is with the underwriter', () => {
  const app = baseApp({ status: 'referred', creditProfile: { score: 580 } });
  assert.equal(decide(officer, app, [stub()], { action: 'approve' }).error, 409);
});

test('an underwriter can only act on referred files', () => {
  assert.equal(decide(underwriter, baseApp(), [stub()], { action: 'approve' }).error, 409);
});

test('an underwriter approves with an exception: waived parameters and reasons are recorded', () => {
  const app = baseApp({ status: 'referred', creditProfile: { score: 580 } });
  const r = decide(underwriter, app, [stub()], {
    action: 'approve',
    waivedParameters: ['credit-score'],
    compensatingFactors: 'Eight years of on-time payments with us and a stable employer',
    relationshipNote: 'Knows the borrower through the branch',
    conditions: 'Autopay required\nProof of insurance',
  });
  assert.equal(r.status, 'approved');
  assert.deepEqual(r.decision.exception.waivedParameters, ['credit-score']);
  assert.deepEqual(r.decision.conditions, ['Autopay required', 'Proof of insurance']);
  assert.equal(r.decision.exception.relationshipNote, 'Knows the borrower through the branch');
});

test('an exception must name every unmet parameter and give compensating factors', () => {
  const app = baseApp({ status: 'referred', creditProfile: { score: 580 } });
  const docs = [stub([affordWarning])];
  assert.match(
    decide(underwriter, app, docs, { action: 'approve', waivedParameters: ['credit-score'], compensatingFactors: 'x'.repeat(30) }).message,
    /affordability/
  );
  assert.match(
    decide(underwriter, app, docs, { action: 'approve', waivedParameters: ['credit-score', 'affordability'], compensatingFactors: 'short' }).message,
    /compensating factors/
  );
});

test('an underwriter cannot approve past a non-waivable parameter', () => {
  const app = baseApp({ status: 'referred', creditProfile: { score: 700 } });
  const docs = [stub([{ field: 'Name', status: 'mismatch' }])];
  const r = decide(underwriter, app, docs, { action: 'approve', waivedParameters: ['identity'], compensatingFactors: 'x'.repeat(30) });
  assert.equal(r.error, 422);
});

test('the underwriter can return a file to the officer, which reopens officer review', () => {
  const app = baseApp({ status: 'referred', creditProfile: { score: 580 } });
  assert.equal(decide(underwriter, app, [stub()], { action: 'return', note: 'x' }).error, 422);
  assert.equal(decide(underwriter, app, [stub()], { action: 'return', note: 'Need a second pay stub from employer two' }).status, 'needs-review');
});

test('rejection needs a stated reason, from either role', () => {
  const app = baseApp({ creditProfile: { score: 580 } });
  assert.equal(decide(officer, app, [stub()], { action: 'reject', note: 'no' }).error, 422);
  assert.equal(decide(officer, app, [stub()], { action: 'reject', note: 'Debt-to-income is too high for this product' }).status, 'rejected');
});

test('a decided application cannot be changed', () => {
  assert.equal(decide(officer, baseApp({ status: 'approved' }), [stub()], { action: 'reject', note: 'x'.repeat(30) }).error, 409);
  assert.equal(decide(underwriter, baseApp({ status: 'rejected' }), [stub()], { action: 'approve' }).error, 409);
});

test('borrowers cannot record decisions', () => {
  const borrower = { name: 'B', email: 'b@x.test', role: 'borrower' };
  assert.equal(decide(borrower, baseApp(), [stub()], { action: 'approve' }).error, 403);
});

test('credit scores outside 300-850 or non-integers are rejected', () => {
  assert.equal(validateCreditScore(299).error, 422);
  assert.equal(validateCreditScore(851).error, 422);
  assert.equal(validateCreditScore('abc').error, 422);
  assert.equal(validateCreditScore(7.5).error, 422);
  assert.equal(validateCreditScore('720').score, 720);
});

test('only whoever holds the file may change the credit score', () => {
  assert.equal(canEnterCreditScore(officer, baseApp()), true);
  assert.equal(canEnterCreditScore(officer, baseApp({ status: 'referred' })), false);
  assert.equal(canEnterCreditScore(underwriter, baseApp({ status: 'referred' })), true);
  assert.equal(canEnterCreditScore(underwriter, baseApp()), false);
  assert.equal(canEnterCreditScore(officer, baseApp({ status: 'approved' })), false);
  assert.equal(canEnterCreditScore({ role: 'borrower' }, baseApp()), false);
});

test('the borrower notice never exposes the exception rationale or relationship note', () => {
  const notice = borrowerNotice({
    decision: {
      outcome: 'approved',
      conditions: ['Autopay required'],
      exception: { waivedParameters: ['credit-score'], compensatingFactors: 'secret rationale', relationshipNote: 'secret relationship' },
    },
  });
  assert.equal(JSON.stringify(notice).includes('secret'), false);
  assert.deepEqual(notice.conditions, ['Autopay required']);
  assert.equal(borrowerNotice({}), null);
});
