import test from 'node:test';
import assert from 'node:assert/strict';
import { forViewer } from '../../src/routes/applications.js';

const internal = {
  _id: 'a1',
  applicantName: 'Arjun Mehta',
  status: 'approved',
  creditProfile: { score: 598, enteredBy: 'officer@x.test' },
  reviewHistory: [{ action: 'refer', note: 'secret justification', details: { relationshipNote: 'secret relationship' } }],
  decision: {
    outcome: 'approved',
    conditions: ['Autopay required'],
    exception: { waivedParameters: ['credit-score'], compensatingFactors: 'secret rationale', relationshipNote: 'secret relationship' },
  },
  assessment: { parameters: [] },
};

test('a borrower never receives the credit score, audit trail or exception rationale', () => {
  const view = forViewer(internal, 'borrower');
  for (const key of ['creditProfile', 'reviewHistory', 'decision']) assert.equal(key in view, false, key);
  assert.equal(JSON.stringify(view).includes('secret'), false);
  assert.equal(JSON.stringify(view).includes('598'), false);
  assert.deepEqual(view.decisionNotice.conditions, ['Autopay required']);
});

test('staff receive the full internal record', () => {
  for (const role of ['officer', 'underwriter']) {
    const view = forViewer(internal, role);
    assert.equal(view.creditProfile.score, 598);
    assert.equal(view.reviewHistory.length, 1);
    assert.equal(view.decision.exception.compensatingFactors, 'secret rationale');
  }
});
