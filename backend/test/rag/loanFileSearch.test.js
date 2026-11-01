import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoanFileIndexer } from '../../src/services/loanFileIndexer.js';
import { buildFileFilter, retrieveFileEvidence } from '../../src/services/loanFileRetrieval.js';
import { buildRagMessages, parseGroundedAnswer, labelEvidence } from '../../src/services/ragPromptBuilder.js';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';

// A tiny in-memory stand-in for the vector store that understands the same filters Chroma does.
function fakeStore() {
  const rows = new Map();
  const matches = (meta, where) => {
    if (where.$and) return where.$and.every((w) => matches(meta, w));
    return Object.entries(where).every(([k, cond]) => {
      if ('$eq' in cond) return meta[k] === cond.$eq;
      if ('$in' in cond) return cond.$in.includes(meta[k]);
      return false;
    });
  };
  return {
    rows,
    ids: async (appId) => [...rows.values()].filter((r) => r.metadata.applicationId === appId).map((r) => r.id),
    upsert: async (records) => records.forEach((r) => rows.set(r.id, r)),
    remove: async (ids) => ids.forEach((id) => rows.delete(id)),
    // "Nearest" here is just insertion order: enough to test filtering, not ranking.
    search: async ({ where, topK }) => {
      const hits = [...rows.values()].filter((r) => matches(r.metadata, where)).slice(0, topK * 3);
      return { ids: [hits.map((h) => h.id)], documents: [hits.map((h) => h.text)], metadatas: [hits.map((h) => h.metadata)], distances: [hits.map(() => 0.2)] };
    },
  };
}

function load(name, id, extra = {}) {
  const def = { ...APPLICATIONS.find((a) => a.applicantName === name), _id: id, status: 'needs-review', createdAt: new Date('2026-10-20'), ...extra };
  const documents = DOCUMENT_FILES[name].map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return { _id: `${id}-d${i}`, fileName: file, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(def, e) };
  });
  return { application: def, documents: withCrossDocumentChecks(def, documents) };
}

function setup(files) {
  const store = fakeStore();
  const embedded = [];
  const indexer = createLoanFileIndexer({
    load: async (id) => files[id] ?? null,
    embed: async (texts) => { embedded.push(...texts); return texts.map(() => [0, 0, 0]); },
    store,
    batchSize: 4,
    log: { error() {} },
  });
  return { store, embedded, indexer, files };
}

test('indexing embeds only redacted text and stores chunks tagged with the application', async () => {
  const files = { A1: load('Meera Iyer', 'A1') };
  files.A1.documents[0].pageTexts = ['Employee SSN 123-45-6789 Account Number: 99887766554433\nNet pay $4,200.00'];
  const { store, embedded, indexer } = setup(files);
  const result = await indexer.index('A1');
  assert.ok(result.chunks >= 8);
  assert.doesNotMatch(embedded.join('\n'), /123-45-6789|99887766554433/);
  assert.ok([...store.rows.values()].every((r) => r.metadata.applicationId === 'A1'));
});

test('re-indexing after a document is replaced removes its chunks, so old figures stop being retrievable', async () => {
  const files = { A1: load('Meera Iyer', 'A1') };
  const { store, indexer } = setup(files);
  await indexer.index('A1');
  assert.ok([...store.rows.values()].some((r) => r.metadata.docType === 'drivers-license'));
  files.A1.documents[1].status = 'superseded';
  const result = await indexer.index('A1');
  assert.ok(result.removed > 0);
  assert.equal([...store.rows.values()].some((r) => r.metadata.docType === 'drivers-license'), false);
});

test('a deleted application loses all of its chunks', async () => {
  const files = { A1: load('Meera Iyer', 'A1') };
  const { store, indexer } = setup(files);
  await indexer.index('A1');
  delete files.A1;
  await indexer.index('A1');
  assert.equal(store.rows.size, 0);
});

test('a burst of changes collapses into one extra run, and a failure never throws', async () => {
  const files = { A1: load('Meera Iyer', 'A1') };
  const { indexer } = setup(files);
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = createLoanFileIndexer({
    load: async (id) => { runs += 1; await gate; return files[id]; },
    embed: async (t) => t.map(() => [0]),
    store: fakeStore(),
    log: { error() {} },
  });
  const first = slow.schedule('A1');
  slow.schedule('A1');
  slow.schedule('A1');
  release();
  await first;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runs, 2, 'one run, plus one rerun for the changes that arrived meanwhile');

  const broken = createLoanFileIndexer({ load: async () => { throw new Error('db down'); }, embed: async () => [], store: fakeStore(), log: { error() {} } });
  assert.equal(await broken.schedule('A1'), null);
  void indexer;
});

test('the search filter always pins the application and the audience, and refuses an empty ID', () => {
  const borrower = buildFileFilter({ applicationId: 'A1', role: 'borrower' });
  assert.deepEqual(borrower.$and[0], { applicationId: { $eq: 'A1' } });
  assert.deepEqual(borrower.$and[2], { audience: { $in: ['borrower'] } });
  assert.deepEqual(buildFileFilter({ applicationId: 'A1', role: 'officer' }).$and[2], { audience: { $in: ['borrower', 'staff'] } });
  assert.throws(() => buildFileFilter({ role: 'borrower' }), /application ID/);
});

test('leak test: a borrower searching their file never gets another applicant or staff-only text', async () => {
  const files = {
    A1: load('Meera Iyer', 'A1', { status: 'referred', reviewHistory: [{ at: new Date('2026-10-22'), actor: { name: 'Olivia Officer' }, action: 'refer', note: 'Internal: thin relationship' }] }),
    B2: load('Priya Nair', 'B2'),
  };
  const { store, indexer } = setup(files);
  await indexer.index('A1');
  await indexer.index('B2');
  const search = (args) => store.search(args);
  const asBorrower = await retrieveFileEvidence({ application: { _id: 'A1' }, role: 'borrower', embedding: [0], deps: { search } });
  assert.ok(asBorrower.length > 0);
  const text = asBorrower.map((e) => e.text).join('\n');
  assert.doesNotMatch(text, /Priya Nair|Internal: thin relationship/);
  assert.ok(asBorrower.every((e) => e.kind === 'file'));
  const asStaff = await retrieveFileEvidence({ application: { _id: 'A1' }, role: 'officer', embedding: [0], topK: 60, deps: { search } });
  assert.match(asStaff.map((e) => e.text).join('\n'), /Internal: thin relationship/);
  assert.doesNotMatch(asStaff.map((e) => e.text).join('\n'), /Priya Nair/);
});

test('a search with no application is refused rather than run unfiltered', async () => {
  await assert.rejects(retrieveFileEvidence({ application: {}, role: 'borrower', embedding: [0], deps: { search: async () => ({}) } }), /application ID/);
});

test('policy and file evidence get separate labels, file citations are accepted and tagged, numbers are checked across both', () => {
  const evidence = [
    { id: 'p-chunk', kind: 'policy', sourceTitle: 'Income Verification Policy', sourceFile: 'income.md', section: 'Tolerance', text: 'Stated and documented income must agree within 5%.' },
    { id: 'lf_1', kind: 'file', sourceTitle: 'Pay stub', sourceFile: 'stub.png', section: 'Extracted fields', text: 'Pay stub: gross monthly income: 5400; net pay: 4200.' },
  ];
  assert.deepEqual(labelEvidence(evidence).map((e) => e.label), ['P1', 'F1']);
  const messages = buildRagMessages({ question: 'Is my income within tolerance?', role: 'borrower', route: { kind: 'general' }, evidence });
  const body = JSON.parse(messages[1].content);
  assert.equal(body.approvedPolicyEvidence[0].id, 'P1');
  assert.equal(body.applicationFileEvidence[0].id, 'F1');
  assert.equal(body.applicationFileEvidence[0].document, 'Pay stub');

  const ok = parseGroundedAnswer('Your pay stub shows gross monthly income of 5400 [F1], and the policy allows a 5% difference [P1].', evidence);
  assert.equal(ok.validationError, null);
  assert.deepEqual(ok.sources.map((s) => s.kind), ['file', 'policy']); // in the order the answer cites them
  const invented = parseGroundedAnswer('Your pay stub shows gross monthly income of 6100 [F1].', evidence);
  assert.equal(invented.validationError, 'ungrounded-number');
  const forged = parseGroundedAnswer('Per your records [F9].', evidence);
  assert.equal(forged.sources.length, 0);
});
