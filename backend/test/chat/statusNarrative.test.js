import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';
import { buildStatusNarrative, toWhatsApp } from '../../src/services/statusNarrative.js';

const NOW = new Date('2026-10-24T12:00:00Z');

// The real seed definitions through the real document checks, no database.
function load(name, extra = {}) {
  const def = { ...APPLICATIONS.find((a) => a.applicantName === name), status: 'needs-review', createdAt: new Date('2026-10-20T09:00:00Z'), ...extra };
  const docs = (DOCUMENT_FILES[name] || []).map((file, i) => {
    const extracted = mockClassifyAndExtract(file);
    return { _id: `d${i}`, docType: extracted.docType, status: 'current', createdAt: new Date(`2026-10-2${i + 1}T10:00:00Z`), extractedFields: extracted.fields, verification: verifyDocument(def, extracted, { now: NOW }) };
  });
  return { application: def, documents: withCrossDocumentChecks(def, docs) };
}

test('Meera Iyer, borrower: says her driver license is expired and asks for a current one', () => {
  const { text, needsAction, openItems } = buildStatusNarrative({ ...load('Meera Iyer'), role: 'borrower' });
  assert.equal(needsAction, true);
  assert.equal(openItems, 1);
  assert.match(text, /^## Your application - Needs your attention/);
  assert.match(text, /\*\*What you need to do\*\*/);
  assert.match(text, /Driver's license\*\* - This ID expired on/);
  assert.match(text, /please upload a current ID\./i);
  assert.equal((text.match(/upload a current/gi) || []).length, 1, 'the ask is not repeated');
});

test('the narrative says what is done, what is wrong and what is next, not just a percentage', () => {
  const { text } = buildStatusNarrative({ ...load('Meera Iyer'), role: 'borrower' });
  assert.match(text, /- \[x\] Application submitted - Oct 20, 2026/);
  assert.match(text, /- \[x\] Documents received - 3 of 3 \(Pay stub, Driver's license, Bank statement\)/);
  assert.match(text, /Automated checks - 14 checks run, 13 matched, 1 needs attention/);
  assert.match(text, /- \[!\] Issues to fix - 1 item to resolve/);
  assert.match(text, /Review - starts once the issues are resolved/);
  assert.match(text, /Decision - pending/);
  assert.match(text, /> Next: Once you have fixed the items above/);
  assert.doesNotMatch(text, /% complete/);
});

test('recent activity lists the dated steps in order, with edits shown old to new', () => {
  const base = load('Meera Iyer');
  const application = {
    ...base.application,
    reviewHistory: [
      { at: new Date('2026-10-20T09:00:00Z'), actor: { name: 'Meera Iyer' }, action: 'submitted' },
      { at: new Date('2026-10-23T09:00:00Z'), actor: { name: 'Meera Iyer' }, action: 'application-edited', details: { changes: [{ label: 'Stated monthly income', kind: 'money', from: 4533, to: 5400 }] } },
    ],
  };
  const { text } = buildStatusNarrative({ application, documents: base.documents, role: 'borrower' });
  const activity = text.slice(text.indexOf('**Recent activity**'));
  assert.ok(activity.indexOf('Application submitted') < activity.indexOf("Driver's license uploaded"));
  assert.match(activity, /Application details corrected by Meera Iyer\n {2}Stated monthly income: \$4,533 -> \$5,400/);
});

test('a borrower never sees staff-only history: credit score entry, notes or waivers', () => {
  const base = load('Meera Iyer');
  const application = {
    ...base.application,
    status: 'referred',
    reviewHistory: [
      { at: new Date('2026-10-21T09:00:00Z'), actor: { name: 'Olivia Officer' }, action: 'credit-score-entered', details: { score: 598 } },
      { at: new Date('2026-10-22T09:00:00Z'), actor: { name: 'Olivia Officer' }, action: 'refer', note: 'Thin relationship, needs exception' },
    ],
  };
  const borrower = buildStatusNarrative({ application, documents: base.documents, role: 'borrower' }).text;
  assert.match(borrower, /Sent for senior review/);
  assert.doesNotMatch(borrower, /598|Thin relationship|Olivia|Credit score/);
  const staff = buildStatusNarrative({ application, documents: base.documents, role: 'officer' }).text;
  assert.match(staff, /^## Meera Iyer - With the underwriter/);
  assert.match(staff, /Referred to the underwriter by Olivia Officer\n {2}"Thin relationship, needs exception"/);
  assert.match(staff, /Credit score recorded by Olivia Officer/);
});

test('a clean application says everything is in and who acts next', () => {
  const { text, needsAction } = buildStatusNarrative({ ...load('Priya Nair', { status: 'submitted' }), role: 'borrower' });
  assert.equal(needsAction, false);
  assert.match(text, /^## Your application - Received/);
  assert.match(text, /Issues to fix - none/);
  assert.match(text, /Everything we need is in\. A loan officer will review/);
  assert.doesNotMatch(text, /What you need to do/);
});

test('a missing document is listed by name with an ask to upload it', () => {
  const base = load('Priya Nair', { status: 'submitted' });
  const { text } = buildStatusNarrative({ application: base.application, documents: base.documents.filter((d) => d.docType !== 'bank-statement'), role: 'borrower' });
  assert.match(text, /Bank statement\*\* - not uploaded yet\. Please upload it\./);
  assert.match(text, /Documents received - 2 of 3/);
});

test('decided applications lead with the outcome; the borrower gets the reason without internal notes', () => {
  const base = load('Priya Nair');
  const rejected = { ...base.application, status: 'rejected', decision: { outcome: 'rejected', reason: 'Debt-to-income is above our limit.', decidedBy: { name: 'Olivia Officer' }, decidedAt: new Date('2026-10-25T00:00:00Z') } };
  const b = buildStatusNarrative({ application: rejected, documents: base.documents, role: 'borrower' }).text;
  assert.match(b, /Not approved/);
  assert.match(b, /We are unable to approve your application/);
  assert.match(b, /\*\*Reason:\*\* Debt-to-income is above our limit\./);
  assert.doesNotMatch(b, /Olivia/);
  const approved = { ...base.application, status: 'approved', decision: { outcome: 'approved', conditions: ['Proof of insurance'], decidedBy: { name: 'Olivia Officer' }, decidedAt: new Date('2026-10-25T00:00:00Z') } };
  const a = buildStatusNarrative({ application: approved, documents: base.documents, role: 'borrower' }).text;
  assert.match(a, /Your loan has been approved\./);
  assert.match(a, /- Proof of insurance/);
});

test('compact mode keeps the headline, the actions and what is next, and drops the checklist and history', () => {
  const { text } = buildStatusNarrative({ ...load('Meera Iyer'), role: 'borrower', compact: true });
  assert.match(text, /What you need to do/);
  assert.match(text, /> Next:/);
  assert.doesNotMatch(text, /Where things stand|Recent activity/);
});

test('toWhatsApp turns the markup into WhatsApp formatting with the same words', () => {
  const { text } = buildStatusNarrative({ ...load('Meera Iyer'), role: 'borrower' });
  const wa = toWhatsApp(text);
  assert.match(wa, /^\*Your application - Needs your attention\*/);
  assert.match(wa, /✅ Application submitted/);
  assert.match(wa, /⚠️ Issues to fix/);
  assert.match(wa, /• \*Driver's license\* - This ID expired/);
  assert.doesNotMatch(wa, /\*\*|^## |^> |- \[/m);
});
