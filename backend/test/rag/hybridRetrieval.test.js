import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildBm25Index, tokenize } from '../../src/services/bm25.js';
import { denseOnly, fuse, hybridSelect, relevant, rerank, retrievePolicyEvidence } from '../../src/services/hybridRetrieval.js';
import { chunkPolicyMarkdown } from '../../src/services/policyChunker.js';
import { recallAtK } from '../../src/services/retrievalMetrics.js';
import { runRetrievalComparison } from '../../src/services/retrievalEval.js';

// The real policy corpus, chunked exactly as ingestion chunks it.
const POLICY_DIR = new URL('../../../data/policies/', import.meta.url);
const chunks = readdirSync(POLICY_DIR).filter((f) => f.endsWith('.md')).flatMap((file) =>
  chunkPolicyMarkdown(readFileSync(new URL(file, POLICY_DIR), 'utf8'), file, '2026-01-01').map((c) => ({ id: c.id, text: c.text, ...c.metadata })));
const golden = JSON.parse(readFileSync(new URL('../../../data/eval/golden-questions-v2.json', import.meta.url), 'utf8'));

test('tokenizing keeps numbers and percentages, splits hyphens, drops filler and stems plurals', () => {
  assert.deepEqual(tokenize('The maximum is $75,000 and 5% of bi-weekly pay'), ['maximum', '75000', '5%', 'bi', 'weekly', 'pay']);
  assert.deepEqual(tokenize('documents approved'), ['document', 'approv']);
});

test('keyword search finds an exact figure and an exact term that vectors can blur', () => {
  const index = buildBm25Index(chunks.map((c) => ({ id: c.id, text: c.text })));
  const byId = new Map(chunks.map((c) => [c.id, c]));
  assert.equal(byId.get(index.search('maximum loan amount 75,000')[0].id).sourceFile, 'auto-loan-requirements.md');
  assert.equal(byId.get(index.search('bi-weekly pay monthly')[0].id).sourceFile, 'income-verification-policy.md');
  assert.equal(byId.get(index.search('beneficial ownership disclosure percentage')[0].id).sourceFile.startsWith('small-business') || byId.get(index.search('beneficial ownership disclosure percentage')[0].id).sourceFile === 'document-checklist.md', true);
});

test('reciprocal rank fusion lifts a chunk that both searches like above one that only a single search likes', () => {
  const out = fuse([['a', 'b', 'c'], ['x', 'b', 'y']]);
  assert.equal(out[0].id, 'b');
  assert.deepEqual(new Set(out.map((o) => o.id)), new Set(['a', 'b', 'c', 'x', 'y']));
});

test('rerank breaks a near tie in favour of the chunk whose heading covers the question', () => {
  const candidates = [
    { id: 'faq', rrf: 0.0163, sourceTitle: 'Borrower FAQ', section: 'Who sees my documents?', text: 'Documents are reviewed by the loan officer.' },
    { id: 'chk', rrf: 0.0164, sourceTitle: 'Document Checklist', section: 'Accepted documents for assets', text: 'Statement of the primary account.' },
  ];
  assert.equal(rerank(candidates, 'who sees my documents')[0].id, 'faq');
});

test('the relevance gate: close in vector space, or a strong keyword match, but not a weak one', () => {
  assert.equal(relevant({ distance: 0.4, bm25: 0, matched: 0 }), true);
  assert.equal(relevant({ distance: 1.4, bm25: 9, matched: 3 }), true);
  assert.equal(relevant({ distance: 1.4, bm25: 9, matched: 1 }), false);
  assert.equal(relevant({ distance: undefined, bm25: 2, matched: 3 }), false);
});

test('hybrid search rescues a question whose vector neighbours are wrong', () => {
  const faq = chunks.find((c) => c.sourceFile === 'loan-faq.md');
  const out = hybridSelect({ question: 'What is the maximum auto loan amount?', dense: [{ ...faq, distance: 0.9 }], chunks });
  assert.equal(out[0].sourceFile, 'auto-loan-requirements.md');
  assert.ok(out.length <= 5);
});

test('a question with nothing in the policies still finds nothing', () => {
  for (const q of ['What is the bank routing number?', 'Can I get a mortgage?', 'What is the weather today?', 'Who is the chief executive of the bank?']) {
    assert.deepEqual(hybridSelect({ question: q, dense: [], chunks }), [], q);
  }
});

test('offline guard: keyword search alone finds the right policy file for most golden policy questions', () => {
  const policy = golden.filter((c) => c.category === 'policy');
  let hits = 0;
  for (const c of policy) {
    const ranked = hybridSelect({ question: c.question, dense: [], chunks }).map((e) => e.sourceFile);
    hits += recallAtK(ranked, c.expect.sources, 5);
  }
  assert.ok(hits / policy.length >= 0.8, `keyword-only recall@5 fell to ${(hits / policy.length).toFixed(2)}`);
});

const flat = (c, distance) => ({ ids: [[c.id]], documents: [[c.text]], metadatas: [[{ sourceFile: c.sourceFile, sourceTitle: c.sourceTitle, section: c.section }]], distances: [[distance]] });

test('retrievePolicyEvidence: dense mode is the original vector-only selection', async () => {
  const faq = chunks.find((c) => c.sourceFile === 'loan-faq.md');
  const out = await retrievePolicyEvidence({ question: 'q', mode: 'dense', deps: { denseSearch: async () => flat(faq, 0.5) } });
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceFile, 'loan-faq.md');
  assert.deepEqual(await retrievePolicyEvidence({ question: 'q', mode: 'dense', deps: { denseSearch: async () => flat(faq, 1.7) } }), [], 'beyond the distance cutoff');
});

test('retrievePolicyEvidence: hybrid mode adds keyword results; with no keyword index it falls back to vector-only', async () => {
  const faq = chunks.find((c) => c.sourceFile === 'loan-faq.md');
  const denseSearch = async () => flat(faq, 0.9);
  const hybrid = await retrievePolicyEvidence({ question: 'What is the maximum auto loan amount?', mode: 'hybrid', deps: { denseSearch, chunks } });
  assert.equal(hybrid[0].sourceFile, 'auto-loan-requirements.md');
  const fallback = await retrievePolicyEvidence({ question: 'What is the maximum auto loan amount?', mode: 'hybrid', deps: { denseSearch, chunks: [] } });
  assert.deepEqual(fallback.map((e) => e.sourceFile), ['loan-faq.md']);
});

test('denseOnly removes duplicates and keeps the first K', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, text: i < 2 ? 'same text' : 'text ' + i, sourceFile: 'f.md', distance: 0.1 * i }));
  assert.equal(denseOnly(rows, 3).length, 3);
  assert.equal(denseOnly(rows, 10).filter((r) => r.text === 'same text').length, 1);
});

test('the comparison reports both modes, the difference, and which questions changed', async () => {
  const golden2 = [
    { question: 'q-both', expected: ['a.md'] },
    { question: 'q-hybrid-only', expected: ['b.md'] },
    { question: 'q-neither', expected: ['c.md'] },
  ];
  const answers = {
    dense: { 'q-both': ['a.md'], 'q-hybrid-only': ['x.md'], 'q-neither': ['x.md'] },
    hybrid: { 'q-both': ['a.md'], 'q-hybrid-only': ['b.md'], 'q-neither': ['x.md'] },
  };
  const out = await runRetrievalComparison({
    golden: golden2,
    embed: async ([q]) => [q],
    retrieveFor: (mode) => async (question) => answers[mode][question].map((sourceFile) => ({ sourceFile })),
  });
  assert.ok(Math.abs(out.dense.recallAtK - 1 / 3) < 1e-9);
  assert.ok(Math.abs(out.hybrid.recallAtK - 2 / 3) < 1e-9);
  assert.ok(out.delta.recallAtK > 0.33);
  assert.deepEqual(out.fixedByHybrid, ['q-hybrid-only']);
  assert.deepEqual(out.brokenByHybrid, []);
});
