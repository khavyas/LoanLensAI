import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATIONS, DOCUMENT_FILES, USERS } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks, openExceptions } from '../../src/services/verification.js';
import { runSimulatedChecks } from '../../src/services/simulatedBureau.js';
import { assessApplication, evaluateDecision } from '../../src/services/decisionRules.js';
import { validateResidency } from '../../src/services/residency.js';
import { AFFORDABILITY, maxAffordableAmount } from '../../src/config/affordability.js';

// The jury demo starts by creating "Nisha Rao" from scratch and uploading her three
// documents by hand (docs/DEMO_SCRIPT.md, "Opening"). These are exactly the values
// typed into the form there. If any of them stops working, the demo script is wrong.
const NOW = new Date('2026-10-31T12:00:00Z');
const FORM = {
  applicantName: 'Nisha Rao',
  applicantEmail: 'nisha.rao@example.demo',
  productType: 'personal-loan',
  requestedAmount: 12000,
  repaymentTermMonths: 36,
  employerName: 'Harbor Analytics',
  statedMonthlyIncome: 6500,
  address: '27 Garden Street, Springfield',
  ssnLast4: '8842',
  dateOfBirth: new Date('1993-02-15'),
  residencyStatus: 'us-citizen',
  requiredDocTypes: ['pay-stub', 'drivers-license', 'bank-statement'],
};
const FILES = ['nisha-rao-pay-stub.png', 'nisha-rao-drivers-license.png', 'nisha-rao-bank-statement.png'];

function upload() {
  return FILES.map((file) => {
    const extracted = mockClassifyAndExtract(file);
    return {
      docType: extracted.docType,
      status: 'current',
      extractedFields: extracted.fields,
      verification: verifyDocument(FORM, extracted, { now: NOW }),
    };
  });
}

test('Nisha Rao is a demo-only applicant: she is NOT pre-loaded by the seed', () => {
  assert.equal(APPLICATIONS.some((a) => a.applicantName === 'Nisha Rao'), false);
  assert.equal(USERS.some((u) => u.email.startsWith('nisha')), false);
  assert.equal(DOCUMENT_FILES['Nisha Rao'], undefined);
});

test('the values typed into the form are accepted by the intake rules', () => {
  const max = maxAffordableAmount('personal-loan', FORM.statedMonthlyIncome, FORM.repaymentTermMonths);
  assert.ok(FORM.requestedAmount <= max, `requested ${FORM.requestedAmount} must be within ${max}`);
  assert.ok(AFFORDABILITY['personal-loan'].termOptions.includes(FORM.repaymentTermMonths));
  assert.ok(FORM.requestedAmount <= AFFORDABILITY['personal-loan'].productCap);
  assert.equal(validateResidency({ residencyStatus: FORM.residencyStatus }, NOW).residencyStatus, 'us-citizen');
});

test('her three uploads are recognised and every document check passes', () => {
  const docs = upload();
  assert.deepEqual(docs.map((d) => d.docType).sort(), ['bank-statement', 'drivers-license', 'pay-stub']);
  for (const d of docs) {
    assert.equal(d.verification.overall, 'pass', d.docType);
    assert.equal(d.verification.checks.every((c) => c.status === 'match'), true, d.docType);
  }
  const licenseFields = docs.find((d) => d.docType === 'drivers-license').verification.checks.map((c) => c.field);
  for (const f of ['Name', 'Date of birth', 'Address', 'ID expiry']) assert.ok(licenseFields.includes(f), f);
});

test('the bank deposit corroborates the pay stub, and no action is left open', () => {
  const docs = withCrossDocumentChecks(FORM, upload());
  const deposit = docs.flatMap((d) => d.verification.checks).find((c) => c.field === 'Bank deposit vs. pay stub net pay');
  assert.equal(deposit.status, 'match');
  assert.deepEqual(openExceptions(FORM, docs), []);
});

test('the simulated checks pass with a score of 720, and the officer can approve', () => {
  const report = runSimulatedChecks(FORM, { now: NOW });
  assert.equal(report.identity.status, 'verified');
  assert.equal(report.sanctions.status, 'clear');
  assert.equal(report.credit.score, 720);
  assert.equal(report.scripted, true);

  const docs = withCrossDocumentChecks(FORM, upload());
  const application = { ...FORM, status: 'submitted', verificationReport: report, creditProfile: { score: 720, source: 'simulated' } };
  const assessment = assessApplication(application, docs, { duplicates: [], now: NOW });
  assert.deepEqual(assessment.unmetKeys, []);
  assert.equal(assessment.canApprove, true);

  const officer = { name: 'Olivia Officer', email: 'o@x.test', role: 'officer' };
  assert.equal(evaluateDecision({ user: officer, application, assessment, body: { action: 'approve' } }).status, 'approved');
});

test('before the checks are run nothing can be approved (the demo shows this)', () => {
  const docs = withCrossDocumentChecks(FORM, upload());
  const assessment = assessApplication({ ...FORM, status: 'submitted' }, docs, { duplicates: [], now: NOW });
  assert.equal(assessment.canApprove, false);
});
