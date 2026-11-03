import test from 'node:test';
import assert from 'node:assert/strict';
import { officerFeedbackAnswer, isOfficerFeedbackQuestion } from '../../src/services/officerFeedback.js';

const app = (over = {}) => ({ status: 'submitted', requiredDocTypes: ['pay-stub', 'drivers-license', 'bank-statement'], reviewHistory: [{ action: 'submitted' }], ...over });
const doc = (docType, over = {}) => ({ docType, status: 'current', verification: { checks: [], overall: 'pass' }, ...over });
const Q = 'what did the officer say about my application?';

test('recognises questions about what the officer said, and ignores policy questions', () => {
  for (const q of [Q, 'Has the loan officer reviewed my file?', 'Any comments from the underwriter on my loan?', 'What did the officer decide about me?']) {
    assert.equal(isOfficerFeedbackQuestion(q), true, q);
  }
  for (const q of ['How long does the loan officer take to review?', 'What does the underwriter review?', 'What documents do I need?', 'What is the status of my application?']) {
    assert.equal(isOfficerFeedbackQuestion(q), false, q);
  }
});

test('with a document missing, says no officer has looked and what to upload', () => {
  const out = officerFeedbackAnswer(Q, app(), [doc('pay-stub'), doc('drivers-license')], 'borrower');
  assert.match(out.answer, /No loan officer has commented/);
  assert.match(out.answer, /only opens a file once every required document is uploaded/);
  assert.match(out.answer, /bank statement/);
  assert.doesNotMatch(out.answer, /Submitted/);
});

test('complete file, no flags: waiting for a loan officer', () => {
  const out = officerFeedbackAnswer(Q, app(), [doc('pay-stub'), doc('drivers-license'), doc('bank-statement')], 'borrower');
  assert.match(out.answer, /No loan officer has commented/);
  assert.match(out.answer, /file is complete \(3 documents/);
});

test('referred, approved and declined applications get the borrower-safe wording', () => {
  const docs = [doc('pay-stub'), doc('drivers-license'), doc('bank-statement')];
  const referred = officerFeedbackAnswer(Q, app({ status: 'referred', reviewHistory: [{ action: 'refer', note: 'internal: low credit score' }] }), docs, 'borrower');
  assert.match(referred.answer, /senior underwriter/);
  assert.doesNotMatch(referred.answer, /credit|internal/i);
  assert.match(officerFeedbackAnswer(Q, app({ status: 'approved', decision: { conditions: ['Proof of insurance'] } }), docs, 'borrower').answer, /approved.*Proof of insurance/);
  assert.match(officerFeedbackAnswer(Q, app({ status: 'rejected', decision: { reason: 'Credit score below minimum' } }), docs, 'borrower').answer, /unable to approve.*Credit score below minimum/);
});

test('staff are not answered here (they search the review record instead)', () => {
  assert.equal(officerFeedbackAnswer(Q, app(), [], 'officer'), null);
});
