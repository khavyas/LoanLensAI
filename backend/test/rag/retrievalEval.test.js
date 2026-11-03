import test from 'node:test';
import assert from 'node:assert/strict';
import { runRetrievalEval } from '../../src/services/retrievalEval.js';

test('runRetrievalEval scores each golden question and lists what was retrieved', async () => {
  const golden = [
    { question: 'q-hit', expected: ['a.md'] },
    { question: 'q-miss', expected: ['b.md'] },
  ];
  const results = { 'q-hit': ['a.md', 'x.md'], 'q-miss': ['x.md'] };
  const out = await runRetrievalEval({
    golden,
    embed: async ([q]) => [q],
    search: async (embedding) => ({ marker: embedding }),
    select: (result) => results[result.marker].map((sourceFile) => ({ sourceFile })),
  });
  assert.equal(out.questions, 2);
  assert.equal(out.recallAtK, 0.5);
  assert.deepEqual(out.misses, ['q-miss']);
  assert.deepEqual(out.details[0], { question: 'q-hit', expected: ['a.md'], found: ['a.md', 'x.md'] });
});

test('checkFloors reports each floor a run misses and passes a good run', async () => {
  const { checkFloors } = await import('../../src/services/retrievalEval.js');
  assert.deepEqual(checkFloors({ k: 5, recallAtK: 0.9, mrr: 0.7 }), []);
  assert.equal(checkFloors({ k: 5, recallAtK: 0.7, mrr: 0.7 }).length, 1);
  assert.equal(checkFloors({ k: 5, recallAtK: 0.7, mrr: 0.4 }).length, 2);
  assert.equal(checkFloors({ k: 5, recallAtK: 0.7, mrr: 0.4 }, { minRecall: 0.5, minMrr: 0.3 }).length, 0);
  assert.equal(checkFloors({ k: 5, recallAtK: NaN, mrr: 0.9 }).length, 1);
});
