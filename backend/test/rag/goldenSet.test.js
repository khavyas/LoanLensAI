import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The golden set must point at policy files that exist, or the eval silently scores nothing.
test('every expected source in the golden set is a real policy file', () => {
  const golden = JSON.parse(readFileSync(new URL('../../../data/eval/golden-policy-questions.json', import.meta.url), 'utf8'));
  const files = new Set(readdirSync(new URL('../../../data/policies/', import.meta.url)));
  assert.ok(golden.length >= 15, 'plan P7-01 asks for at least 15 questions');
  for (const item of golden) {
    assert.ok(item.question && item.expected.length, item.question);
    for (const f of item.expected) assert.ok(files.has(f), `${f} (for "${item.question}")`);
  }
});
