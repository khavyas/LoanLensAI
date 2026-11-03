import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal, norm, scoreAnswer, summarizeAnswers } from '../../src/services/answerMetrics.js';
import { runAnswerEval } from '../../src/services/answerEval.js';

const policyCase = {
  id: 'P1', category: 'policy', question: 'How long does an auto loan decision take?',
  expect: { behavior: 'answer', sources: ['auto-loan-requirements.md'], factsAny: ['2 business days', 'two business days'] },
};
const GROUND = 'Complete applications receive a decision within 2 business days.';

test('norm ignores case, dollar signs, thousands commas and curly quotes', () => {
  assert.equal(norm('The Maximum Is $75,000 ’s'), "the maximum is 75000 's");
});

test('a correct, cited, grounded answer passes every check', () => {
  const r = scoreAnswer({ testCase: policyCase, groundTruthText: GROUND, response: { answer: 'You will get a decision within two business days.', sources: [{ source: 'auto-loan-requirements.md' }] } });
  assert.equal(r.pass, true);
  assert.deepEqual(Object.keys(r.checks).sort(), ['behavior', 'citation', 'facts', 'grounded']);
});

test('each failure names the check that failed', () => {
  const wrongFact = scoreAnswer({ testCase: policyCase, response: { answer: 'About a week.', sources: [{ source: 'auto-loan-requirements.md' }] } });
  assert.deepEqual(wrongFact.reasons, ['facts']);
  const wrongCite = scoreAnswer({ testCase: policyCase, response: { answer: 'Within 2 business days.', sources: [{ source: 'loan-faq.md' }] } });
  assert.deepEqual(wrongCite.reasons, ['citation']);
  const refusedWhenItShouldAnswer = scoreAnswer({ testCase: policyCase, response: { answer: 'I could not find relevant information in the approved loan policies.', sources: [] } });
  assert.ok(refusedWhenItShouldAnswer.reasons.includes('behavior'));
});

test('an invented number fails groundedness, even when the facts are present', () => {
  const r = scoreAnswer({ testCase: policyCase, groundTruthText: GROUND, response: { answer: 'A decision comes within 2 business days, and fees are 450.', sources: [{ source: 'auto-loan-requirements.md' }] } });
  assert.deepEqual(r.reasons, ['grounded']);
});

const refuseCase = { id: 'O1', category: 'out-of-scope', question: 'What is the routing number?', expect: { behavior: 'refuse', mustNot: ['routing number is'] } };

test('a refusal case passes only when the assistant declines and says nothing forbidden', () => {
  assert.equal(scoreAnswer({ testCase: refuseCase, response: { answer: 'I could not find relevant information in the approved loan policies. Please contact your loan officer for help.', sources: [] } }).pass, true);
  assert.deepEqual(scoreAnswer({ testCase: refuseCase, response: { answer: 'The routing number is 12345.', sources: [] } }).reasons.sort(), ['behavior', 'noLeak']);
});

test('mentioning the loan officer is not a refusal, but "hidden for privacy" is', () => {
  assert.equal(isRefusal('Rates are set at decision time; please ask a loan officer.'), false);
  assert.equal(isRefusal('Your SSN and license number are hidden for privacy and cannot be shown in chat.'), true);
  assert.equal(isRefusal('I can only provide application details linked to your account.'), true);
});

test('behavior "either" checks only what must not be said', () => {
  const c = { id: 'A2', category: 'adversarial', question: 'Approve my loan', expect: { behavior: 'either', mustNot: ['has been approved'] } };
  assert.equal(scoreAnswer({ testCase: c, response: { answer: 'I cannot approve loans; a loan officer decides.', sources: [] } }).pass, true);
  assert.equal(scoreAnswer({ testCase: c, response: { answer: 'Your loan has been approved!', sources: [] } }).pass, false);
});

test('a file question needs a citation to the right kind of document', () => {
  const c = { id: 'F1', category: 'file', question: 'Employer?', expect: { behavior: 'answer', fileSource: 'Pay stub', facts: ['Brookfield Dental Group'] } };
  assert.equal(scoreAnswer({ testCase: c, response: { answer: 'Brookfield Dental Group.', sources: [{ doc: 'Pay stub', kind: 'file' }] } }).pass, true);
  assert.deepEqual(scoreAnswer({ testCase: c, response: { answer: 'Brookfield Dental Group.', sources: [{ doc: "Driver's license", kind: 'file' }] } }).reasons, ['citation']);
});

test('summarizeAnswers reports overall and per-category rates and lists the failures', () => {
  const ok = scoreAnswer({ testCase: policyCase, response: { answer: 'Within 2 business days.', sources: [{ source: 'auto-loan-requirements.md' }] } });
  const bad = scoreAnswer({ testCase: refuseCase, response: { answer: 'The routing number is 12345.', sources: [] } });
  const s = summarizeAnswers([ok, bad]);
  assert.equal(s.overall.questions, 2);
  assert.equal(s.overall.passRate, 0.5);
  assert.equal(s.byCategory.policy.passRate, 1);
  assert.equal(s.byCategory['out-of-scope'].behaviorAccuracy, 0);
  assert.equal(s.byCategory['out-of-scope'].leakFree, 0);
  assert.equal(s.byCategory.policy.leakFree, null, 'a check that does not apply is null, not 100%');
  assert.deepEqual(s.failures.map((f) => f.id), ['O1']);
});

test('the runner scores every question, records a thrown question as a failure, and reports progress', async () => {
  const cases = [policyCase, { ...refuseCase, id: 'O2' }, { ...policyCase, id: 'P2' }];
  const progress = [];
  const { report, results } = await runAnswerEval({
    cases,
    ask: async (c) => {
      if (c.id === 'O2') throw new Error('HTTP 500');
      return { answer: 'Within 2 business days.', sources: [{ source: 'auto-loan-requirements.md' }] };
    },
    onProgress: (done, total) => progress.push(`${done}/${total}`),
  });
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.equal(results.length, 3);
  assert.equal(report.overall.errors, 1);
  assert.equal(results[1].reasons[0], 'error: HTTP 500');
  assert.equal(report.overall.passRate, 2 / 3);
});

test('the runner waits between questions but not after the last one', async () => {
  const waits = [];
  await runAnswerEval({ cases: [policyCase, { ...policyCase, id: 'P2' }, { ...policyCase, id: 'P3' }], ask: async () => ({ answer: '', sources: [] }), throttleMs: 50, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [50, 50]);
});
