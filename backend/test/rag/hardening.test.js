import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRagMessages, parseGroundedAnswer, ungroundedNumbers, numbersIn, PROMPT_VERSION } from '../../src/services/ragPromptBuilder.js';
import { createCircuitBreaker, CircuitOpenError } from '../../src/services/circuitBreaker.js';
import { createRateLimiter } from '../../src/services/rateLimiter.js';
import { recallAtK, precisionAtK, reciprocalRank, summarizeRetrieval } from '../../src/services/retrievalMetrics.js';

const evidence = [{ id: 'c1', sourceTitle: 'Auto Loan Requirements', sourceFile: 'auto-loan-requirements.md', section: 'Timeline',
  text: 'Decisions are made within 2 business days. Income must be within 5% of the stated amount, up to $75,000.' }];

test('numbersIn normalises amounts and ignores list markers', () => {
  assert.deepEqual(numbersIn('1. Pay $15,000 at 5% over 36 months\n2) next'), ['15000', '5', '36']);
});

test('an answer whose numbers all come from the evidence passes, with a snippet in the citation', () => {
  const r = parseGroundedAnswer('You will hear back within 2 business days. [P1]', evidence);
  assert.equal(r.validationError, null);
  assert.equal(r.sources[0].chunkId, 'c1');
  assert.match(r.sources[0].snippet, /^Decisions are made/);
});

test('an invented figure is rejected even though the citation is valid', () => {
  const r = parseGroundedAnswer('You will hear back within 7 business days. [P1]', evidence);
  assert.equal(r.validationError, 'ungrounded-number');
  assert.equal(r.sources.length, 0);
  assert.match(r.answer, /could not verify the figures/);
});

test('a number the borrower typed in the question may be repeated', () => {
  assert.deepEqual(ungroundedNumbers('Yes, $9,000 is fine.', evidence, 'Can I borrow $9,000?'), []);
  assert.deepEqual(ungroundedNumbers('Yes, $9,000 is fine.', evidence, 'Can I borrow money?'), ['9000']);
});

test('the number check does not apply to status-only answers', () => {
  const r = parseGroundedAnswer('Your application has 2 documents.', [], { citationsRequired: false });
  assert.equal(r.validationError, null);
});

test('the prompt version is exported', () => {
  assert.match(PROMPT_VERSION, /^policy(-file)?-qa-v\d+$/);
  assert.ok(buildRagMessages({ question: 'q', role: 'borrower', route: { kind: 'general' }, evidence }));
});

test('circuit opens after repeated failures, fails fast, then recovers after the cooldown', async () => {
  let t = 0;
  const breaker = createCircuitBreaker({ threshold: 2, cooldownMs: 1000, now: () => t });
  const boom = async () => { throw new Error('down'); };
  await assert.rejects(breaker.run(boom), /down/);
  await assert.rejects(breaker.run(boom), /down/);
  assert.equal(breaker.state(), 'open');
  let called = false;
  await assert.rejects(breaker.run(async () => { called = true; }), CircuitOpenError);
  assert.equal(called, false, 'provider is not called while open');
  t = 1500;
  assert.equal(await breaker.run(async () => 'ok'), 'ok');
  assert.equal(breaker.state(), 'closed');
});

test('a failed trial call re-opens the circuit at once; client aborts are not failures', async () => {
  let t = 0;
  const breaker = createCircuitBreaker({ threshold: 2, cooldownMs: 1000, now: () => t });
  const boom = async () => { throw new Error('down'); };
  await assert.rejects(breaker.run(boom));
  await assert.rejects(breaker.run(boom));
  t = 2000;
  await assert.rejects(breaker.run(boom), /down/);
  assert.equal(breaker.state(), 'open');
  const fresh = createCircuitBreaker({ threshold: 1, cooldownMs: 1000, now: () => t });
  const abort = Object.assign(new Error('gone'), { name: 'AbortError' });
  await assert.rejects(fresh.run(async () => { throw abort; }));
  assert.equal(fresh.state(), 'closed');
});

test('rate limiter blocks after the limit per user and frees up as the window slides', () => {
  let t = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  const blocked = limiter.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(limiter.check('b').allowed, true, 'other users are unaffected');
  t = 1100;
  assert.equal(limiter.check('a').allowed, true);
});

test('retrieval metrics: recall, precision, MRR and the misses list', () => {
  const exp = ['a.md'];
  assert.equal(recallAtK(['x.md', 'a.md'], exp, 1), 0);
  assert.equal(recallAtK(['x.md', 'a.md'], exp, 2), 1);
  assert.equal(precisionAtK(['a.md', 'x.md', 'a.md', 'y.md'], exp, 4), 0.5);
  assert.equal(reciprocalRank(['x.md', 'y.md', 'a.md'], exp), 1 / 3);
  assert.equal(reciprocalRank(['x.md'], exp), 0);
  const s = summarizeRetrieval([
    { question: 'q1', expected: exp, ranked: ['a.md'] },
    { question: 'q2', expected: exp, ranked: ['x.md', 'y.md'] },
    { question: 'out-of-scope', expected: [], ranked: ['x.md'] },
  ], 5);
  assert.equal(s.questions, 2);
  assert.equal(s.recallAtK, 0.5);
  assert.equal(s.mrr, 0.5);
  assert.deepEqual(s.misses, ['q2']);
});
