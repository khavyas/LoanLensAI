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
