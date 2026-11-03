import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPLICATIONS, DOCUMENT_FILES, USERS } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';
import { buildApplicationChunks } from '../../src/services/loanFileChunker.js';
import { norm } from '../../src/services/answerMetrics.js';

// The golden set must itself be correct: every expected fact has to exist in the policy text or in
// the applicant's indexed file, or a good answer would be marked wrong.
const golden = JSON.parse(readFileSync(new URL('../../../data/eval/golden-questions-v2.json', import.meta.url), 'utf8'));
const policy = (file) => readFileSync(new URL(`../../../data/policies/${file}`, import.meta.url), 'utf8');

function fileTextFor(name) {
  const def = { ...APPLICATIONS.find((a) => a.applicantName === name), _id: 'x', status: 'needs-review', createdAt: new Date('2026-10-20') };
  const docs = withCrossDocumentChecks(def, (DOCUMENT_FILES[name] || []).map((f, i) => {
    const e = mockClassifyAndExtract(f);
    return { _id: `d${i}`, fileName: f, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(def, e) };
  }));
  return norm(buildApplicationChunks({ application: def, documents: docs }).map((c) => c.text).join('\n'));
}

test('the set has at least 100 questions with unique ids and the expected categories', () => {
  assert.ok(golden.length >= 100, `only ${golden.length} questions`);
  assert.equal(new Set(golden.map((c) => c.id)).size, golden.length);
  const categories = new Set(golden.map((c) => c.category));
  for (const c of ['policy', 'file', 'file-staff', 'status', 'mixed', 'out-of-scope', 'adversarial', 'followup']) assert.ok(categories.has(c), c);
});

test('every question is well formed and names a seeded applicant and a real role', () => {
  const names = new Set(APPLICATIONS.map((a) => a.applicantName));
  const roles = new Set(USERS.map((u) => u.role));
  for (const c of golden) {
    assert.ok(c.question?.trim(), c.id);
    assert.ok(names.has(c.persona.applicant), `${c.id}: unknown applicant ${c.persona.applicant}`);
    assert.ok(roles.has(c.persona.role), `${c.id}: unknown role ${c.persona.role}`);
    assert.ok(['answer', 'refuse', 'either'].includes(c.expect.behavior), c.id);
    if (c.expect.behavior === 'answer') assert.ok(c.expect.facts?.length || c.expect.factsAny?.length, `${c.id}: an answer case needs expected facts`);
  }
});

test('policy questions: expected files exist and contain the expected facts', () => {
  for (const c of golden.filter((x) => x.category === 'policy' || x.category === 'followup')) {
    const text = norm(c.expect.sources.map(policy).join('\n'));
    for (const f of c.expect.facts || []) assert.ok(text.includes(norm(f)), `${c.id}: fact "${f}" is not in ${c.expect.sources.join(', ')}`);
    if (c.expect.factsAny?.length) assert.ok(c.expect.factsAny.some((f) => text.includes(norm(f))), `${c.id}: none of ${JSON.stringify(c.expect.factsAny)} is in the sources`);
  }
});

test('file questions: expected facts exist in the applicant file that is indexed', () => {
  for (const c of golden.filter((x) => (x.category === 'file' || x.category === 'file-staff') && x.expect.behavior === 'answer')) {
    const text = fileTextFor(c.persona.applicant);
    for (const f of c.expect.facts || []) assert.ok(text.includes(norm(f)), `${c.id}: "${f}" is not in ${c.persona.applicant}'s indexed file`);
    if (c.expect.factsAny?.length) assert.ok(c.expect.factsAny.some((f) => text.includes(norm(f))), `${c.id}: none of ${JSON.stringify(c.expect.factsAny)}`);
  }
});

test('protected values the assistant must refuse really are absent from the indexed file', () => {
  for (const c of golden.filter((x) => x.expect.mustNot?.length && x.category.startsWith('file'))) {
    const text = fileTextFor(c.persona.applicant);
    for (const s of c.expect.mustNot) assert.ok(!text.includes(norm(s)), `${c.id}: "${s}" leaks into the index`);
  }
});

test('refusal questions carry no expected facts, and every case that must not leak says what', () => {
  for (const c of golden.filter((x) => x.expect.behavior === 'refuse')) assert.ok(!c.expect.facts && !c.expect.factsAny, c.id);
  assert.ok(golden.filter((x) => x.category === 'adversarial').every((c) => c.expect.mustNot?.length), 'adversarial cases need forbidden strings');
});
