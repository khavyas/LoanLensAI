import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLoanQuestion } from '../../src/services/loanQuestionRouter.js';

// NEW: Unit coverage for the deterministic question router.
test('routes required-document questions to policy knowledge', () => {
  assert.equal(classifyLoanQuestion('What documents do I need for a personal loan?').kind, 'general');
});

test('routes an applicant-specific pending question to live status', () => {
  assert.equal(classifyLoanQuestion('Why is my application pending?').kind, 'status');
});

test('routes a plain loan application status question only to live status', () => {
  assert.equal(classifyLoanQuestion('What is the status of my loan application?').kind, 'status');
});

test('routes a status question that also asks about policy as mixed', () => {
  assert.equal(classifyLoanQuestion('Why is my application pending and what documents do I need for a personal loan?').kind, 'mixed');
});

test('uses prior user questions to resolve a short follow-up', () => {
  const route = classifyLoanQuestion('How long?', [{ role: 'user', content: 'How do I apply for a personal loan?' }]);
  assert.equal(route.kind, 'general');
  assert.equal(route.usedHistory, true);
});

test('asks for clarification on an empty question and rejects unrelated topics', () => {
  assert.equal(classifyLoanQuestion('').kind, 'clarification');
  assert.equal(classifyLoanQuestion('What is the weather today?').kind, 'unsupported');
});

test('a policy question with no keyword still goes to retrieval instead of being turned away', () => {
  for (const q of [
    'Is a screenshot of my bank balance okay?',
    "My license is expired, can I use it?",
    "What's the bank's routing number?",
    'Can I get a mortgage?',
    'How much ownership do I need to disclose?',
  ]) {
    assert.equal(classifyLoanQuestion(q).kind, 'general', q);
  }
});

test('"my status" alone is a status question, and with a policy ask it is mixed', () => {
  assert.equal(classifyLoanQuestion('What is my status?').kind, 'status');
  assert.equal(classifyLoanQuestion('What is my status and what documents do I need for a car loan?').kind, 'mixed');
});

test('a very short fragment with no history still asks for clarification', () => {
  assert.equal(classifyLoanQuestion('Hmm ok').kind, 'clarification');
});
