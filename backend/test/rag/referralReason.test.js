import test from 'node:test';
import assert from 'node:assert/strict';
import { referralReasonAnswer, isReferralReasonQuestion } from '../../src/services/referralReason.js';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';
import { runSimulatedChecks } from '../../src/services/simulatedBureau.js';

const def = APPLICATIONS.find((a) => a.applicantName === 'Kavya Reddy');
const docs = withCrossDocumentChecks(def, (DOCUMENT_FILES['Kavya Reddy'] || []).map((f) => {
  const ex = mockClassifyAndExtract(f);
  return { docType: ex.docType, status: 'current', extractedFields: ex.fields, verification: verifyDocument(def, ex) };
}));
const report = runSimulatedChecks(def);
const referred = {
  ...def, status: 'referred', verificationReport: report, creditProfile: { score: report.credit.score, source: 'simulated' },
  reviewHistory: [{ action: 'refer', at: new Date('2026-11-05T13:37:00Z'), actor: { name: 'Olivia Officer', role: 'officer' }, note: 'this loan application has low credit score' }],
};
const Q = 'why is this document forwarded to me?';

test('recognises why-was-this-sent questions', () => {
  for (const q of [Q, 'Why was this referred to me?', 'reason for escalation']) assert.equal(isReferralReasonQuestion(q), true, q);
  for (const q of ['What documents do I need?', 'How do I refer a file?']) assert.equal(isReferralReasonQuestion(q), false, q);
});

test("the underwriter is told it is the low credit score, with the officer's note", () => {
  const r = referralReasonAnswer(Q, referred, docs, 'underwriter');
  assert.match(r.answer, /credit score \(Score 572 against a minimum of 660\)/);
  assert.match(r.answer, /Olivia Officer/);
  assert.match(r.answer, /low credit score/);
  assert.match(r.answer, /waive/);
});

test('borrowers never get it, and a file that was not referred falls through', () => {
  assert.equal(referralReasonAnswer(Q, referred, docs, 'borrower'), null);
  assert.equal(referralReasonAnswer(Q, { ...referred, status: 'submitted', reviewHistory: [] }, docs, 'underwriter'), null);
});
