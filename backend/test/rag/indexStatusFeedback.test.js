import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoanFileIndexer } from '../../src/services/loanFileIndexer.js';
import { buildFeedbackRecord, goldenCandidates } from '../../src/services/feedbackRecord.js';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument } from '../../src/services/verification.js';

function loaded() {
  const application = { ...APPLICATIONS.find((a) => a.applicantName === 'Meera Iyer'), _id: 'A1', status: 'needs-review', createdAt: new Date('2026-10-20') };
  const documents = DOCUMENT_FILES['Meera Iyer'].map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return { _id: 'd' + i, fileName: file, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(application, e) };
  });
  return { application, documents };
}
const memoryStore = () => ({ rows: new Map(), ids: async () => [], upsert: async (r) => r, remove: async () => {} });

test('indexing reports indexing, then indexed with the chunk count', async () => {
  const events = [];
  const indexer = createLoanFileIndexer({ load: async () => loaded(), embed: async (t) => t.map(() => [0]), store: memoryStore(), onStatus: async (id, status, info) => events.push([id, status, info.chunks]) });
  const result = await indexer.index('A1');
  assert.deepEqual(events.map((e) => e[1]), ['indexing', 'indexed']);
  assert.equal(events[1][2], result.chunks);
});

test('a failed index is reported as failed with a short reason, and the error still reaches the caller', async () => {
  const events = [];
  const indexer = createLoanFileIndexer({
    load: async () => loaded(),
    embed: async () => { throw new Error('embedding service is down ' + 'x'.repeat(500)); },
    store: memoryStore(),
    onStatus: async (id, status, info) => events.push([status, info.error]),
    log: { error() {} },
  });
  await assert.rejects(indexer.index('A1'), /embedding service is down/);
  assert.equal(events[1][0], 'failed');
  assert.ok(events[1][1].length <= 200);
  assert.equal(await indexer.schedule('A1'), null, 'schedule never throws');
});

test('a deleted application writes no status', async () => {
  const events = [];
  const indexer = createLoanFileIndexer({ load: async () => null, embed: async () => [], store: memoryStore(), onStatus: async (...a) => events.push(a) });
  await indexer.index('GONE');
  assert.deepEqual(events, []);
});

test('a status that cannot be saved does not break indexing', async () => {
  const indexer = createLoanFileIndexer({ load: async () => loaded(), embed: async (t) => t.map(() => [0]), store: memoryStore(), onStatus: async () => { throw new Error('db down'); }, log: { error() {} } });
  assert.ok((await indexer.index('A1')).chunks > 0);
});

const user = { role: 'borrower' };

test('feedback needs a rating, a question and an answer', () => {
  assert.match(buildFeedbackRecord({ body: { rating: 'maybe', question: 'q', answer: 'a' }, user, applicationId: 'A1' }).error, /rating/);
  assert.match(buildFeedbackRecord({ body: { rating: 'up', question: '', answer: 'a' }, user, applicationId: 'A1' }).error, /required/);
});

test('feedback text is redacted and trimmed before it is stored', () => {
  const { record } = buildFeedbackRecord({
    body: { rating: 'down', question: 'My SSN is 123-45-6789, why was I flagged?', answer: 'x'.repeat(5000), comment: 'call me on (555) 123-4567', sources: [{ doc: 'Pay stub', section: 'Extracted fields', kind: 'file' }, { doc: 'p', kind: 'weird' }], promptVersion: 'policy-file-qa-v4' },
    user: { role: 'officer' }, applicationId: 'A1', retrievalMode: 'hybrid',
  });
  assert.doesNotMatch(record.question, /123-45-6789/);
  assert.match(record.question, /\[SSN\]/);
  assert.match(record.comment, /\[PHONE\]/);
  assert.equal(record.answer.length, 4000);
  assert.equal(record.role, 'staff');
  assert.equal(record.retrievalMode, 'hybrid');
  assert.equal(record.sources[0].kind, 'file');
  assert.equal(record.sources[1].kind, undefined, 'an unknown source kind is dropped');
});

test('rated-down answers become golden-set skeletons that a person still has to complete', () => {
  const out = goldenCandidates([{ _id: 'abcdef123456', role: 'borrower', question: 'Why?', answer: 'Because.', comment: 'wrong date', sources: [{ source: 'loan-faq.md' }] }]);
  assert.equal(out[0].id, 'FB-123456');
  assert.equal(out[0].needsReview, true);
  assert.deepEqual(out[0].expect.sources, ['loan-faq.md']);
  assert.equal(out[0].note, 'wrong date');
});
