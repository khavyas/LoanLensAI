import test from 'node:test';
import assert from 'node:assert/strict';
import { borrowerExplanation, borrowerView, borrowerDocument } from '../../src/services/borrowerWording.js';

const staffCheck = { field: 'Monthly income', expected: '$5,400', found: '$7,200', status: 'mismatch', explanation: 'Application states $5,400/mo but this document shows $7,200/mo (33% difference). Ask the borrower to confirm or provide additional proof of income.' };
const goodCheck = { field: 'ID expiry', status: 'mismatch', explanation: 'This ID expired on 04/30/2026. Policy does not accept expired identification — please upload a current ID.' };

test('staff-directed explanations are rewritten for the borrower, with the figures', () => {
  const text = borrowerExplanation(staffCheck);
  assert.doesNotMatch(text, /ask the borrower/i);
  assert.match(text, /Your application states \$5,400 per month, but this document shows \$7,200/);
  assert.match(text, /Edit application/);
});

test('explanations that already address the applicant are kept exactly', () => {
  assert.equal(borrowerExplanation(goodCheck), goodCheck.explanation);
});

test('an unknown staff-directed explanation falls back to a safe generic line', () => {
  const text = borrowerExplanation({ field: 'Something new', explanation: 'Escalate to an officer.' });
  assert.equal(text, 'This item needs another look. Please contact your loan officer.');
});

test('borrowerView rewrites every document check and open exception, and leaves the rest alone', () => {
  const app = {
    status: 'needs-review',
    documents: [{ docType: 'pay-stub', verification: { overall: 'needs-review', checks: [staffCheck, goodCheck] } }],
    openExceptions: [{ type: 'flagged', docType: 'pay-stub', checks: [staffCheck], message: staffCheck.explanation }, { type: 'missing', docType: 'w2', message: 'w2 has not been uploaded yet.' }],
  };
  const out = borrowerView(app);
  assert.doesNotMatch(JSON.stringify(out), /ask the borrower/i);
  assert.equal(out.documents[0].verification.checks[1].explanation, goodCheck.explanation);
  assert.match(out.openExceptions[0].message, /Your application states/);
  assert.equal(out.openExceptions[1].message, 'w2 has not been uploaded yet.');
  assert.equal(app.documents[0].verification.checks[0].explanation, staffCheck.explanation, 'the input is not changed');
  assert.match(borrowerDocument(app.documents[0]).verification.checks[0].explanation, /Your application states/);
});
