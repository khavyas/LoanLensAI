import test from 'node:test';
import assert from 'node:assert/strict';
import { redactText, redactFields } from '../../src/services/redaction.js';
import { buildApplicationChunks } from '../../src/services/loanFileChunker.js';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';

test('redaction removes SSNs, account numbers, birth dates, phones and emails but keeps amounts', () => {
  const out = redactText('SSN 123-45-6789, Account Number: 123456789012, DOB: 03/12/1994, call (555) 123-4567 or a.b@example.com. Net pay $4,200.50 on 2026-10-01; deposit $12,345,678.90.');
  assert.doesNotMatch(out, /123-45-6789|123456789012|03\/12\/1994|555|a\.b@example/);
  assert.match(out, /\[SSN\]/);
  assert.match(out, /Account Number: \[REDACTED NUMBER\]/);
  assert.match(out, /DOB: \[DATE OF BIRTH\]/);
  assert.match(out, /\[PHONE\]/);
  assert.match(out, /\[EMAIL\]/);
  assert.match(out, /\$4,200\.50/);
  assert.match(out, /2026-10-01/);
  assert.match(out, /\$12,345,678\.90/);
});

test('redactFields blanks identifier fields by name and keeps pay-stub figures', () => {
  const out = redactFields({ ssnLast4: '9034', dateOfBirth: '1991-11-22', licenseNumber: 'D1234567', address: '88 Lakeview Drive', socialSecurityWithheld: 446.4, netPay: 4200, employerName: 'Cedar Health' });
  assert.equal(out.ssnLast4, '[redacted]');
  assert.equal(out.dateOfBirth, '[redacted]');
  assert.equal(out.licenseNumber, '[redacted]');
  assert.equal(out.address, '[redacted]');
  assert.equal(out.socialSecurityWithheld, '446.4');
  assert.equal(out.netPay, '4200');
  assert.equal(out.employerName, 'Cedar Health');
});

function meera(extra = {}) {
  const def = { ...APPLICATIONS.find((a) => a.applicantName === 'Meera Iyer'), _id: 'app-meera', status: 'needs-review', createdAt: new Date('2026-10-20'), ...extra };
  const docs = DOCUMENT_FILES['Meera Iyer'].map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return { _id: `d${i}`, fileName: file, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(def, e) };
  });
  return { application: def, documents: withCrossDocumentChecks(def, docs) };
}

test('chunks cover the application, each current document and the verification result', () => {
  const chunks = buildApplicationChunks(meera());
  const kinds = chunks.map((c) => c.metadata.kind);
  assert.ok(kinds.includes('application'));
  assert.equal(kinds.filter((k) => k === 'document-fields').length, 3);
  assert.equal(kinds.filter((k) => k === 'verification').length, 3);
  const license = chunks.find((c) => c.metadata.kind === 'verification' && c.metadata.docType === 'drivers-license');
  assert.match(license.text, /expired on 04\/30\/2026/);
  assert.equal(license.metadata.applicationId, 'app-meera');
  assert.equal(license.metadata.audience, 'borrower');
});

test('no identifier survives into any chunk', () => {
  const { application, documents } = meera();
  documents[0].pageTexts = ['Employee SSN 123-45-6789  Account Number: 99887766554433  DOB: 01/02/1990\nNet pay $4,200.00'];
  const all = buildApplicationChunks({ application, documents }).map((c) => c.text).join('\n');
  assert.doesNotMatch(all, /123-45-6789|99887766554433|01\/02\/1990|7301|2218/);
  assert.match(all, /\$4,200\.00/);
  assert.doesNotMatch(all, /Willow Court/, 'street address is not indexed');
});

test('long documents are split into chunks that remember their pages', () => {
  const { application, documents } = meera();
  documents[2].pageTexts = Array.from({ length: 30 }, (_, i) => `Page ${i + 1} statement lines. ` + 'Deposit payroll 1,200.00. '.repeat(30));
  const chunks = buildApplicationChunks({ application, documents }).filter((c) => c.metadata.kind === 'document-text');
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every((c) => c.text.length < 1500));
  assert.equal(chunks[0].metadata.page, 1);
  assert.match(chunks[0].metadata.section, /^Pages? 1/);
  assert.ok(chunks.some((c) => c.metadata.page > 20), 'later pages are indexed too');
});

test('a replaced document is not indexed as current', () => {
  const { application, documents } = meera();
  documents[1].status = 'superseded';
  const chunks = buildApplicationChunks({ application, documents });
  assert.equal(chunks.filter((c) => c.metadata.docType === 'drivers-license').length, 0);
  assert.match(chunks.find((c) => c.metadata.kind === 'activity').text, /Driver's license uploaded and later replaced/);
});

test('review notes and referrals are staff-only; edits are visible to the borrower; the score is never indexed', () => {
  const { application, documents } = meera({
    status: 'referred',
    reviewHistory: [
      { at: new Date('2026-10-20'), actor: { name: 'Meera Iyer' }, action: 'submitted' },
      { at: new Date('2026-10-21'), actor: { name: 'Meera Iyer' }, action: 'application-edited', details: { changes: [{ label: 'Stated monthly income', kind: 'money', from: 4533, to: 5400 }] } },
      { at: new Date('2026-10-22'), actor: { name: 'Olivia Officer' }, action: 'credit-score-entered', details: { score: 598 } },
      { at: new Date('2026-10-23'), actor: { name: 'Olivia Officer' }, action: 'refer', note: 'Thin relationship, needs exception' },
    ],
  });
  const chunks = buildApplicationChunks({ application, documents });
  const staff = chunks.find((c) => c.metadata.kind === 'review-record');
  const activity = chunks.find((c) => c.metadata.kind === 'activity');
  assert.equal(staff.metadata.audience, 'staff');
  assert.match(staff.text, /Thin relationship, needs exception/);
  assert.equal(activity.metadata.audience, 'borrower');
  assert.match(activity.text, /changed from \$4,533 to \$5,400/);
  assert.doesNotMatch(activity.text, /Thin relationship|Olivia|598/);
  assert.doesNotMatch(chunks.map((c) => c.text).join('\n'), /598/);
});

test('chunk ids are stable across runs, so re-indexing replaces instead of duplicating', () => {
  const a = buildApplicationChunks(meera()).map((c) => c.id);
  const b = buildApplicationChunks(meera()).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('the borrower verification chunk is in borrower wording; the officer wording is a staff-only chunk', () => {
  const def = { ...APPLICATIONS.find((a) => a.applicantName === 'Arjun Mehta'), _id: 'app-arjun', status: 'needs-review', createdAt: new Date('2026-10-20') };
  const documents = withCrossDocumentChecks(def, DOCUMENT_FILES['Arjun Mehta'].map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return { _id: 'a' + i, fileName: file, docType: e.docType, status: 'current', createdAt: new Date('2026-10-21'), extractedFields: e.fields, verification: verifyDocument(def, e) };
  }));
  const chunks = buildApplicationChunks({ application: def, documents });
  const borrowerText = chunks.filter((c) => c.metadata.audience === 'borrower').map((c) => c.text).join('\n');
  assert.doesNotMatch(borrowerText, /confirm with borrower|ask the borrower|escalate to an officer/i);
  const staff = chunks.find((c) => c.metadata.kind === 'verification-staff');
  assert.equal(staff.metadata.audience, 'staff');
  assert.match(staff.text, /confirm with borrower/);
});
