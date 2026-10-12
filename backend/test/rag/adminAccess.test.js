import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../../src/middleware/requireRole.js';
import { extractPolicyText } from '../../src/services/policyFileText.js';

test('only an administrator passes the RAG upload role guard', () => {
  let allowed = false;
  const next = () => { allowed = true; };
  let responseStatus;
  let responseBody;
  const response = {
    status(code) { responseStatus = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  requireRole('admin')({ user: { role: 'borrower' } }, response, next);
  assert.equal(allowed, false);
  assert.equal(responseStatus, 403);
  assert.match(responseBody.error, /administrator/i);

  requireRole('admin')({ user: { role: 'admin' } }, response, next);
  assert.equal(allowed, true);
});

test('policy upload accepts UTF-8 text and rejects unsupported document types', async () => {
  const text = await extractPolicyText('policy.md', Buffer.from('# Loan policy\n\n' + 'Approved document requirement. '.repeat(5)));
  assert.match(text, /Approved document requirement/);
  await assert.rejects(() => extractPolicyText('policy.docx', Buffer.from('not supported')), /Markdown, TXT, or PDF/);
});
