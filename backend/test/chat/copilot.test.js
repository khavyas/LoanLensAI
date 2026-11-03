import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';
import { assessApplication } from '../../src/services/decisionRules.js';
import { buildCopilotBrief, collectFindings } from '../../src/services/copilot.js';

function load(name, extra = {}) {
  const application = { ...APPLICATIONS.find((a) => a.applicantName === name), _id: 'x', status: 'needs-review', createdAt: new Date('2026-10-20'), ...extra };
  const documents = withCrossDocumentChecks(application, DOCUMENT_FILES[name].map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return { _id: `d${i}`, fileName: file, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(application, e) };
  }));
  return { application, documents, assessment: assessApplication(application, documents) };
}

const fakePolicy = async (text) => (/expir/i.test(text)
  ? { sourceTitle: 'Document Checklist and Standards', section: 'Accepted documents for identity', sourceFile: 'document-checklist.md', text: 'A valid, unexpired driver license... Expired documents are not accepted.' }
  : null);

test('the contradictions for Meera Iyer are the expired license, with the policy that governs it', async () => {
  const brief = await buildCopilotBrief({ action: 'contradictions', ...load('Meera Iyer'), policyFor: fakePolicy });
  assert.equal(brief.findings.length, 1);
  assert.equal(brief.findings[0].check, 'ID expiry');
  assert.equal(brief.findings[0].severity, 'mismatch');
  assert.match(brief.text, /## Meera Iyer - contradictions and checks/);
  assert.match(brief.text, /Driver's license - ID expiry\*\* \(mismatch\): expected Not expired; found Expires 04\/30\/2026/);
  assert.match(brief.text, /Policy: Document Checklist and Standards, Accepted documents for identity: "A valid, unexpired driver license/);
  assert.ok(brief.sources.some((s) => s.kind === 'policy' && s.source === 'document-checklist.md'));
  assert.ok(brief.sources.some((s) => s.kind === 'file' && s.doc === "Driver's license"));
  assert.doesNotMatch(brief.text, /Documents\*\*/, 'the contradictions view leaves out the document list');
});

test('the officer sees the officer wording of a finding (Arjun: employer on the pay stub differs)', async () => {
  const brief = await buildCopilotBrief({ action: 'contradictions', ...load('Arjun Mehta') });
  assert.equal(brief.findings.some((f) => f.check === 'Employer'), true);
  assert.match(brief.text, /confirm with borrower/);
});

test('the file summary lists each document with its result and key values, without identifiers', async () => {
  const brief = await buildCopilotBrief({ action: 'summary', ...load('Meera Iyer') });
  assert.match(brief.text, /## Meera Iyer - file summary/);
  assert.match(brief.text, /- \[x\] \*\*Pay stub\*\* - pass: .*employer name Brookfield Dental Group; gross monthly income 5400/);
  assert.match(brief.text, /- \[!\] \*\*Driver's license\*\* - fail: license expiry 04\/30\/2026/);
  assert.match(brief.text, /Application states: stated income \$5,400\/month; employer Brookfield Dental Group/);
  assert.doesNotMatch(brief.text, /2218|Willow|09\/21/, 'SSN last 4, address and date of birth are not shown');
});

test('a clean file says there are no contradictions and what the officer can do', async () => {
  const brief = await buildCopilotBrief({ action: 'summary', ...load('Priya Nair', { status: 'submitted' }) });
  assert.equal(brief.findings.length, 0);
  assert.match(brief.text, /No contradictions found/);
  assert.match(brief.text, /Not yet met for approval/, 'identity and credit checks have not been run');
  assert.match(brief.text, /> Next: /);
});

test('missing documents appear in the summary as not uploaded', async () => {
  const base = load('Priya Nair', { status: 'submitted' });
  const documents = base.documents.filter((d) => d.docType !== 'bank-statement');
  const brief = await buildCopilotBrief({ action: 'summary', application: base.application, documents, assessment: assessApplication(base.application, documents) });
  assert.match(brief.text, /- \[ \] \*\*Bank statement\*\* - not uploaded/);
});

test('if the policy search fails the brief still lists every finding, just without the policy passage', async () => {
  const brief = await buildCopilotBrief({ action: 'contradictions', ...load('Meera Iyer'), policyFor: async () => { throw new Error('chroma down'); } });
  assert.equal(brief.findings.length, 1);
  assert.equal(brief.findings[0].policy, undefined);
  assert.doesNotMatch(brief.text, /Policy:/);
});

test('only the first few findings trigger a policy search', async () => {
  let calls = 0;
  const { application, documents, assessment } = load('Meera Iyer');
  const many = documents.map((d) => ({ ...d, verification: { ...d.verification, checks: Array.from({ length: 5 }, (_, i) => ({ field: 'Check ' + i, status: 'mismatch', expected: 'a', found: 'b', explanation: 'x' + i })) } }));
  await buildCopilotBrief({ application, documents: many, assessment, policyFor: async () => { calls += 1; return null; }, maxPolicyLookups: 4 });
  assert.equal(calls, 4);
});

test('hard mismatches come before warnings', () => {
  const docs = [{ docType: 'pay-stub', status: 'current', verification: { checks: [
    { field: 'W', status: 'warning', explanation: 'w' },
    { field: 'M', status: 'mismatch', explanation: 'm' },
    { field: 'OK', status: 'match', explanation: 'ok' },
  ] } }];
  assert.deepEqual(collectFindings(docs).map((f) => f.check), ['M', 'W']);
});
