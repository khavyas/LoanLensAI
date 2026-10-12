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
