import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { can, fileAudiences, mayReadStaffContent, AuthzError } from '../../src/services/authz.js';

const app = (email) => ({ applicantEmail: email });

test('deny by default: unknown actions, roles, principals and missing resources are refused', () => {
  const officer = { role: 'officer', email: 'o@x.test' };
  assert.equal(can(officer, 'application:chat', app('a@x.test')), true);
  assert.equal(can(officer, 'application:delete', app('a@x.test')), false, 'unknown action');
  assert.equal(can(officer, undefined, app('a@x.test')), false);
  assert.equal(can(officer, 'application:chat', null), false, 'no resource');
  assert.equal(can({ role: 'Officer' }, 'copilot:use'), false, 'role names are exact');
  assert.equal(can({ role: 'guest' }, 'copilot:use'), false);
  assert.equal(can(null, 'copilot:use'), false);
  assert.equal(can({}, 'rag:admin'), false);
  assert.equal(can({ role: 'admin' }, 'toString'), false, 'prototype keys are not actions');
});

test('actions by role', () => {
  const roles = { borrower: 'b@x.test', officer: 'o@x.test', underwriter: 'u@x.test', admin: 'a@x.test' };
  const allowed = (action) => Object.keys(roles).filter((role) => can({ role, email: roles[role] }, action, app('someone@else.test')));
  assert.deepEqual(allowed('application:chat'), ['officer', 'underwriter']);
  assert.deepEqual(allowed('copilot:use'), ['officer', 'underwriter']);
  assert.deepEqual(allowed('rag:admin'), ['admin']);
  for (const role of ['borrower', 'admin']) assert.equal(can({ role, email: 'me@x.test' }, 'application:chat', app(' ME@x.test')), true, `${role} on own application`);
});

test('file search audiences come from one place and fail closed', () => {
  assert.deepEqual(fileAudiences('borrower'), ['borrower']);
  assert.deepEqual(fileAudiences('admin'), ['borrower']);
  assert.deepEqual(fileAudiences('officer'), ['borrower', 'staff']);
  assert.deepEqual(fileAudiences('underwriter'), ['borrower', 'staff']);
  for (const role of [undefined, null, '', 'root', 'OFFICER']) assert.throws(() => fileAudiences(role), AuthzError);
  assert.equal(mayReadStaffContent('officer'), true);
  assert.equal(mayReadStaffContent('borrower'), false);
  assert.equal(mayReadStaffContent('root'), false);
});

test('the retrieval code holds no role rules of its own', () => {
  // Role comparisons belong in authz.js; if one reappears in the retrieval files, this fails.
  for (const file of ['loanFileRetrieval.js', 'hybridRetrieval.js', 'chatAccess.js']) {
    const source = readFileSync(new URL(`../../src/services/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /role\s*[!=]==?\s*['"]|isStaff|\['borrower'/, `${file} compares roles itself`);
  }
  assert.ok(readdirSync(new URL('../../src/services/', import.meta.url)).includes('authz.js'));
});
