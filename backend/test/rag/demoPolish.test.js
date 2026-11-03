import test from 'node:test';
import assert from 'node:assert/strict';
import { missingDocumentAnswer } from '../../src/services/missingDocument.js';
import { retrieveFileEvidence, focusedKinds } from '../../src/services/loanFileRetrieval.js';

const stub = { docType: 'pay-stub', fileName: 'stub.png' };

test('a question about a document that is not on file gets an exact "not uploaded" answer', () => {
  const asked = missingDocumentAnswer('What does my driver license say?', [stub], 'borrower');
  assert.match(asked.answer, /cannot find a driver's license in your file/);
  assert.match(asked.answer, /Documents tab/);
  assert.deepEqual(asked.sources, [{ doc: 'Application documents' }]);
  assert.match(missingDocumentAnswer('When does the driver license expire?', [stub], 'officer').answer, /no driver's license on this application/);
});

test('the not-uploaded answer is skipped when the document exists or the question is about policy', () => {
  const license = { docType: 'drivers-license', fileName: 'l.png' };
  assert.equal(missingDocumentAnswer('What does my driver license say?', [stub, license], 'borrower'), null);
  assert.equal(missingDocumentAnswer('What documents do I need for a car loan?', [stub], 'borrower'), null);
  assert.equal(missingDocumentAnswer('Is a driver license required for a personal loan?', [stub], 'borrower'), null);
  assert.equal(missingDocumentAnswer('What does my pay stub say?', [], 'borrower').answer.includes('pay stub'), true);
});

test('only staff get the extra review-record search, and it keeps the server-built filter', async () => {
  assert.deepEqual(focusedKinds('What note was recorded on this application?', 'officer'), ['review-record']);
  assert.deepEqual(focusedKinds('What note was recorded on this application?', 'borrower'), []);
  assert.deepEqual(focusedKinds('What employer is on my pay stub?', 'officer'), []);

  const calls = [];
  const search = async ({ where }) => {
    calls.push(where);
    const focused = JSON.stringify(where).includes('review-record');
    return focused
      ? { ids: [['rr']], documents: [['Internal review record: referred. Note: This has low credit score.']], metadatas: [[{ sourceTitle: 'Application record', section: 'Review record' }]], distances: [[0.9]] }
      : { ids: [['vs']], documents: [['Flagged findings for the loan officer: employer differs.']], metadatas: [[{ sourceTitle: 'Pay stub', section: 'Verification findings (officer wording)' }]], distances: [[0.3]] };
  };
  const staff = await retrieveFileEvidence({ application: { _id: 'a1' }, role: 'officer', question: 'What note was recorded on this application?', embedding: [0.1], deps: { search } });
  assert.equal(staff[0].id, 'rr', 'the review record comes first');
  assert.equal(staff.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].$and.some((c) => c.applicationId?.$eq === 'a1'), 'still pinned to the application');
  assert.ok(calls[1].$and.some((c) => c.audience), 'still filtered by audience');

  calls.length = 0;
  const borrower = await retrieveFileEvidence({ application: { _id: 'a1' }, role: 'borrower', question: 'What note was recorded on this application?', embedding: [0.1], deps: { search } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].$and.find((c) => c.audience).audience.$in, ['borrower']);
  assert.equal(borrower.some((e) => e.id === 'rr'), false);
});
