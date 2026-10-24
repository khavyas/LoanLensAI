import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateMatches } from '../../src/services/duplicateCheck.js';
import { residencyParameter, validateResidency } from '../../src/services/residency.js';
import { assessApplication, evaluateDecision } from '../../src/services/decisionRules.js';
import { APPLICATIONS } from '../../src/services/seedData.js';

const NOW = new Date('2026-10-24T12:00:00Z');
const day = (s) => new Date(s);

// ---- duplicate identity -------------------------------------------------
const earlier = { _id: 'a1', applicantName: 'Priya Nair', ssnLast4: '9034', dateOfBirth: day('1991-11-22'), status: 'submitted', createdAt: day('2026-10-01') };
const later = { _id: 'a2', applicantName: 'Anil Kapoor', ssnLast4: '9034', dateOfBirth: day('1991-11-22'), status: 'submitted', createdAt: day('2026-10-02') };

test('the later application is flagged when an earlier one has the same SSN last-4 and date of birth under another name', () => {
  const m = findDuplicateMatches(later, [earlier]);
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, 'different-name');
  assert.equal(m[0].applicantName, 'Priya Nair');
});

test('the earlier application is NOT flagged — the original is never penalised', () => {
  assert.deepEqual(findDuplicateMatches(earlier, [later]), []);
});

test('a closed earlier application under another name still counts as identity reuse', () => {
  assert.equal(findDuplicateMatches(later, [{ ...earlier, status: 'rejected' }])[0].kind, 'different-name');
});

test('the same person with another OPEN application is flagged; a decided one is not', () => {
  const again = { ...later, applicantName: 'Priya Nair' };
  assert.equal(findDuplicateMatches(again, [earlier])[0].kind, 'same-person-open');
  assert.deepEqual(findDuplicateMatches(again, [{ ...earlier, status: 'approved' }]), []);
  assert.deepEqual(findDuplicateMatches(again, [{ ...earlier, status: 'rejected' }]), []);
});

test('a different date of birth, or a different last-4, is not a match', () => {
  assert.deepEqual(findDuplicateMatches(later, [{ ...earlier, dateOfBirth: day('1990-01-01') }]), []);
  assert.deepEqual(findDuplicateMatches(later, [{ ...earlier, ssnLast4: '1111' }]), []);
});

test('without a date of birth nothing can be confirmed, so nothing is flagged', () => {
  assert.deepEqual(findDuplicateMatches({ ...later, dateOfBirth: undefined }, [earlier]), []);
});

test('an application never matches itself, and ties on timestamp fall back to id order', () => {
  assert.deepEqual(findDuplicateMatches(later, [later]), []);
  const t = day('2026-10-02');
  assert.equal(findDuplicateMatches({ ...later, createdAt: t }, [{ ...earlier, createdAt: t }]).length, 1);
  assert.equal(findDuplicateMatches({ ...earlier, createdAt: t }, [{ ...later, createdAt: t }]).length, 0);
});

// ---- residency ----------------------------------------------------------
test('citizens and permanent residents meet the residency rule', () => {
  assert.equal(residencyParameter({ residencyStatus: 'us-citizen' }, NOW).status, 'met');
  assert.equal(residencyParameter({ residencyStatus: 'permanent-resident' }, NOW).status, 'met');
});

test('a visa that outlasts the loan term meets the rule; one that ends sooner does not', () => {
  const ok = residencyParameter({ residencyStatus: 'visa-holder', visaValidUntil: day('2030-01-01'), repaymentTermMonths: 36 }, NOW);
  assert.equal(ok.status, 'met');
  const short = residencyParameter({ residencyStatus: 'visa-holder', visaValidUntil: day('2028-06-30'), repaymentTermMonths: 36 }, NOW);
  assert.equal(short.status, 'unmet');
  assert.equal(short.waivable, true);
  assert.match(short.detail, /2028-06-30/);
});

test('missing residency data is pending, never silently met', () => {
  assert.equal(residencyParameter({}, NOW).status, 'pending');
  assert.equal(residencyParameter({ residencyStatus: 'visa-holder' }, NOW).status, 'pending');
});

test('intake validation: status required, visa holders need a future expiry date', () => {
  assert.equal(validateResidency({}, NOW).error, 400);
  assert.equal(validateResidency({ residencyStatus: 'other' }, NOW).error, 400);
  assert.equal(validateResidency({ residencyStatus: 'visa-holder' }, NOW).error, 400);
  assert.equal(validateResidency({ residencyStatus: 'visa-holder', visaValidUntil: '2020-01-01' }, NOW).error, 400);
  assert.equal(validateResidency({ residencyStatus: 'us-citizen' }, NOW).residencyStatus, 'us-citizen');
  assert.equal(validateResidency({ residencyStatus: 'visa-holder', visaValidUntil: '2028-06-30' }, NOW).visaValidUntil.toISOString().slice(0, 10), '2028-06-30');
});

// ---- the two jury stories through the real assessment and decision rules --
const report = {
  source: 'simulated',
  identity: { status: 'verified', detail: 'ok' },
  sanctions: { status: 'clear', detail: 'ok' },
  credit: { status: 'scored', score: 730, detail: 'ok' },
};
const param = (a, key) => a.parameters.find((p) => p.key === key);
const stub = { docType: 'pay-stub', status: 'current', verification: { checks: [], overall: 'pass' } };
const license = { docType: 'drivers-license', status: 'current', verification: { checks: [], overall: 'pass' } };
const bank = { docType: 'bank-statement', status: 'current', verification: { checks: [], overall: 'pass' } };
const docs = [stub, license, bank];
const underwriter = { name: 'Uma Underwriter', email: 'u@x.test', role: 'underwriter' };
const officer = { name: 'Olivia Officer', email: 'o@x.test', role: 'officer' };

test('Anil Kapoor (reused identity) is blocked and cannot be referred or waived', () => {
  const def = APPLICATIONS.find((a) => a.applicantName === 'Anil Kapoor');
  const priya = APPLICATIONS.find((a) => a.applicantName === 'Priya Nair');
  const dupes = findDuplicateMatches(
    { ...def, _id: 'z2', createdAt: day('2026-10-02') },
    [{ ...priya, _id: 'z1', createdAt: day('2026-10-01') }]
  );
  const a = assessApplication({ ...def, verificationReport: report, creditProfile: { score: 730 } }, docs, { duplicates: dupes, now: NOW });
  assert.equal(param(a, 'duplicate-identity').status, 'unmet');
  assert.equal(param(a, 'duplicate-identity').waivable, false);
  assert.equal(a.canApprove, false);
  assert.equal(a.canRefer, false);
  assert.equal(a.duplicates[0].applicantName, 'Priya Nair');
});

test("Priya Nair (the original) keeps a clean file even though Anil copied her details", () => {
  const priya = APPLICATIONS.find((a) => a.applicantName === 'Priya Nair');
  const anil = APPLICATIONS.find((a) => a.applicantName === 'Anil Kapoor');
  const dupes = findDuplicateMatches(
    { ...priya, _id: 'z1', createdAt: day('2026-10-01') },
    [{ ...anil, _id: 'z2', createdAt: day('2026-10-02') }]
  );
  const a = assessApplication({ ...priya, verificationReport: report, creditProfile: { score: 742 } }, docs, { duplicates: dupes, now: NOW });
  assert.equal(param(a, 'duplicate-identity').status, 'met');
  assert.equal(a.canApprove, true);
});

test('Lakshmi Pillai (visa ends before the loan) can only be approved as an exception, with a condition', () => {
  const def = APPLICATIONS.find((a) => a.applicantName === 'Lakshmi Pillai');
  const app = { ...def, status: 'needs-review', verificationReport: report, creditProfile: { score: 730 } };
  const a = assessApplication(app, docs, { now: NOW });
  assert.deepEqual(a.unmetKeys, ['residency']);
  assert.equal(a.canApprove, false);
  assert.equal(a.canRefer, true);

  const referred = { ...app, status: 'referred' };
  const result = evaluateDecision({
    user: underwriter,
    application: referred,
    assessment: assessApplication(referred, docs, { now: NOW }),
    body: {
      action: 'approve',
      waivedParameters: ['residency'],
      compensatingFactors: 'Employer has sponsored the visa renewal; seven years of US employment history.',
      conditions: 'Proof of visa renewal before 2028-06-30',
    },
  });
  assert.equal(result.status, 'approved');
  assert.deepEqual(result.decision.exception.waivedParameters, ['residency']);
  assert.deepEqual(result.decision.conditions, ['Proof of visa renewal before 2028-06-30']);

  // The officer cannot approve it alone.
  const own = evaluateDecision({ user: officer, application: app, assessment: a, body: { action: 'approve' } });
  assert.equal(own.error, 422);
});

test('every seeded borrower declares a residency status', () => {
  for (const a of APPLICATIONS) assert.ok(a.residencyStatus, a.applicantName);
});
