import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNamedApplicant } from '../../../frontend/src/utils/applicantNames.js';

const apps = [
  { _id: 'k', applicantName: 'Kavya Reddy' },
  { _id: 'p', applicantName: 'Priya Nair' },
  { _id: 'a', applicantName: 'Arjun Mehta' },
  { _id: 'd1', applicantName: 'Dana Whitfield' },
  { _id: 'd2', applicantName: 'Dana Whitfield' },
];
const open = apps[0]; // Kavya's application is open on screen

test('the exact question from the bug report is about Priya, not the open application', () => {
  const r = resolveNamedApplicant("what is priya's loan application status", open, apps);
  assert.equal(r.kind, 'other');
  assert.equal(r.application._id, 'p');
});

test('names match in any letter case, by first or last name, with or without a possessive', () => {
  for (const q of ['Priya Nair status', 'show NAIR documents', "why is Arjun's file flagged", 'documents of mehta']) {
    assert.equal(resolveNamedApplicant(q, open, apps).kind, 'other', q);
  }
});

test('no name means the open application', () => {
  assert.equal(resolveNamedApplicant('what is the status of this application', open, apps).kind, 'none');
  assert.equal(resolveNamedApplicant("what is my loan's progress", open, apps).kind, 'none');
});

test("naming the open applicant is still the open application", () => {
  assert.equal(resolveNamedApplicant("what is kavya's status", open, apps).kind, 'none');
});

test('an unknown name is never quietly answered with the open application', () => {
  assert.equal(resolveNamedApplicant("what is ravi's loan status", open, apps).kind, 'defer');
});

test('two applicants in one question, or one name with several applications, go to the server', () => {
  assert.equal(resolveNamedApplicant('compare priya and arjun status', open, apps).kind, 'defer');
  assert.equal(resolveNamedApplicant('what is dana status', open, apps).kind, 'defer');
  assert.equal(resolveNamedApplicant('priya and kavya status', open, apps).kind, 'defer');
});
