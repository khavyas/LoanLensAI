import test from 'node:test';
import assert from 'node:assert/strict';
import { createFailover, AllProvidersFailedError } from '../../src/services/chatFailover.js';
import { createCircuitBreaker } from '../../src/services/circuitBreaker.js';
import { buildDegradedAnswer } from '../../src/services/degradedAnswer.js';

const provider = (name, call, t = () => 0) => ({ name, call, breaker: createCircuitBreaker({ name, threshold: 2, cooldownMs: 1000, now: t }) });
const down = async () => { throw new Error('down'); };

test('the first provider answers when it is healthy; the standby is not called', async () => {
  let standbyCalls = 0;
  const generate = createFailover([provider('a', async () => 'from a'), provider('b', async () => { standbyCalls += 1; return 'from b'; })]);
  assert.deepEqual(await generate([]), { text: 'from a', provider: 'a' });
  assert.equal(standbyCalls, 0);
});

test('a failing provider hands over to the standby, and is skipped once its circuit opens', async () => {
  let primaryCalls = 0;
  const generate = createFailover([provider('a', async () => { primaryCalls += 1; throw new Error('down'); }), provider('b', async () => 'from b')]);
  assert.equal((await generate([])).provider, 'b');
  assert.equal((await generate([])).provider, 'b');
  assert.equal(primaryCalls, 2);
  assert.equal((await generate([])).provider, 'b');
  assert.equal(primaryCalls, 2, 'circuit is open, primary is not tried again');
});

test('when every provider fails the caller gets AllProvidersFailedError naming each', async () => {
  const generate = createFailover([provider('a', down), provider('b', down)]);
  await assert.rejects(generate([]), (e) => e instanceof AllProvidersFailedError && e.failures.length === 2 && /a: down; b: down/.test(e.message));
});

test('a client disconnect stops the chain instead of trying the standby', async () => {
  const abort = Object.assign(new Error('gone'), { name: 'AbortError' });
  let standbyCalls = 0;
  const generate = createFailover([provider('a', async () => { throw abort; }), provider('b', async () => { standbyCalls += 1; return 'x'; })]);
  await assert.rejects(generate([]), (e) => e.name === 'AbortError');
  assert.equal(standbyCalls, 0);
});

const evidence = [1, 2, 3, 4].map((n) => ({ id: `c${n}`, sourceTitle: `Policy ${n}`, sourceFile: `p${n}.md`, section: `Section ${n}`, text: `Passage ${n} text.` }));

test('degraded answer shows the top three policy passages with sources and is flagged degraded', () => {
  const r = buildDegradedAnswer({ evidence });
  assert.equal(r.degraded, true);
  assert.equal(r.sources.length, 3);
  assert.match(r.answer, /cannot write a full answer/);
  assert.match(r.answer, /\*\*Policy 1 - Section 1\*\*\nPassage 1 text\./);
  assert.doesNotMatch(r.answer, /Passage 4/);
});

test('degraded answer for a status question leads with the database status', () => {
  const r = buildDegradedAnswer({ evidence: [], statusText: 'The status recorded for your application is **submitted**.' });
  assert.match(r.answer, /^The status recorded for your application is \*\*submitted\*\*\./);
  assert.match(r.answer, /not available right now/);
  assert.deepEqual(r.sources, []);
});

test('long passages are clipped', () => {
  const r = buildDegradedAnswer({ evidence: [{ ...evidence[0], text: 'x'.repeat(2000) }] });
  assert.ok(r.answer.length < 900);
  assert.ok(r.sources[0].snippet.length <= 223);
});
