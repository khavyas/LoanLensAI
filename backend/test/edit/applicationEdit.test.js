import test from 'node:test';
import assert from 'node:assert/strict';
import { editableFields, reverifyDocuments, statusAfterEdit, validateEdit } from '../../src/services/applicationEdit.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument } from '../../src/services/verification.js';

// The case from the bug report: a borrower typed income $4,533 and employer "test", but
// the pay stub (Priya Nair's seed documents) says $7,200 at Cedar Health Systems.
const wrong = () => ({
  _id: 'a1',
  applicantName: 'Priya Nair',
  applicantEmail: 'priya@example.test',
  productType: 'personal-loan',
  status: 'needs-review',
  requestedAmount: 15000,
  repaymentTermMonths: 36,
  statedMonthlyIncome: 4533,
  employerName: 'test',
  employerPhone: '1231231233',
  address: '88 Lakeview Drive, Springfield',
  loanReason: 'Health reasons',
  ssnLast4: '9034',
  dateOfBirth: new Date('1991-11-22'),
  residencyStatus: 'us-citizen',
  requiredDocTypes: ['pay-stub', 'drivers-license', 'bank-statement'],
});

const FILES = ['priya-nair-pay-stub.png', 'priya-nair-drivers-license.png', 'priya-nair-bank-statement.png'];
function documents(application, extra = {}) {
  return FILES.map((file, i) => {
    const e = mockClassifyAndExtract(file);
    return {
      _id: `d${i}`,
      docType: e.docType,
      status: 'current',
      confidence: e.confidence,
      extractedFields: e.fields,
      verification: verifyDocument(application, e),
      ...(extra[e.docType] || {}),
    };
  });
}

test("only non-identity facts are editable, and they differ by product", () => {
  assert.ok(editableFields('personal-loan').includes('statedMonthlyIncome'));
  assert.ok(!editableFields('personal-loan').includes('businessName'));
  assert.ok(editableFields('small-business-loan').includes('businessName'));
  for (const locked of ['ssnLast4', 'dateOfBirth', 'applicantName']) {
    assert.ok(!editableFields('personal-loan').includes(locked));
    assert.ok(!editableFields('small-business-loan').includes(locked));
  }
});

test('correcting income and employer fixes the flagged application, and it leaves the officer queue', () => {
  const app = wrong();
  assert.equal(statusAfterEdit(app, documents(app)), 'needs-review', 'flagged before the edit');

  const edit = validateEdit(app, { statedMonthlyIncome: 7200, employerName: 'Cedar Health Systems' });
  assert.equal(edit.error, undefined);
  assert.deepEqual(edit.diff.map((d) => [d.field, d.from, d.to]), [
    ['statedMonthlyIncome', 4533, 7200],
    ['employerName', 'test', 'Cedar Health Systems'],
  ]);

  const fixed = { ...app, ...edit.updates };
  const docs = documents(fixed); // the same uploads, re-checked against the corrected values
  assert.equal(docs.flatMap((d) => d.verification.checks).some((c) => c.status === 'mismatch' || c.status === 'warning'), false);
  assert.equal(statusAfterEdit(fixed, docs), 'submitted');
});

test('reverifyDocuments reruns every current document from its stored extraction', () => {
  const app = { ...wrong(), statedMonthlyIncome: 7200, employerName: 'Cedar Health Systems' };
  const stale = documents(wrong()); // stored with the OLD, wrong application
  const result = reverifyDocuments(app, stale);
  assert.equal(result.length, 3);
  const payStub = result.find((r) => r.id === 'd0').verification;
  assert.equal(payStub.checks.find((c) => c.field === 'Monthly income').status, 'match');
  assert.equal(payStub.overall, 'pass');
});

test('superseded documents are left alone', () => {
  const app = wrong();
  const docs = documents(app);
  docs[0].status = 'superseded';
  assert.equal(reverifyDocuments(app, docs).some((r) => r.id === 'd0'), false);
});

test('a document-type check from a targeted re-upload survives re-verification', () => {
  const app = wrong();
  const docs = documents(app, { 'drivers-license': { expectedDocType: 'drivers-license' } });
  const license = reverifyDocuments(app, docs).find((r) => r.id === 'd1').verification;
  assert.ok(license.checks.some((c) => c.field === 'Document type' && c.status === 'match'));
});

test('a flag that is not fixed keeps the application in review', () => {
  const app = wrong();
  const edit = validateEdit(app, { employerName: 'Cedar Health Systems' }); // income still wrong
  const fixed = { ...app, ...edit.updates };
  assert.equal(statusAfterEdit(fixed, documents(fixed)), 'needs-review');
});

test('once the file is with the underwriter or decided, it can no longer be edited', () => {
  for (const status of ['referred', 'approved', 'rejected']) {
    const r = validateEdit({ ...wrong(), status }, { statedMonthlyIncome: 7200 });
    assert.equal(r.error, 409, status);
  }
  assert.equal(validateEdit({ ...wrong(), status: 'submitted' }, { statedMonthlyIncome: 7200 }).error, undefined);
});

test('identity details cannot be changed online, whatever else is sent', () => {
  for (const field of ['ssnLast4', 'dateOfBirth', 'applicantName', 'residencyStatus', 'visaValidUntil', 'productType']) {
    const r = validateEdit(wrong(), { statedMonthlyIncome: 7200, [field]: 'x' });
    assert.equal(r.error, 422, field);
    assert.match(r.message, /loan officer/i);
  }
});

test('unknown fields, and fields of another product, are refused', () => {
  assert.equal(validateEdit(wrong(), { status: 'approved' }).error, 400);
  assert.equal(validateEdit(wrong(), { businessName: 'Acme' }).error, 400);
  assert.equal(validateEdit(wrong(), { requiredDocTypes: [] }).error, 400);
});

test('bad values are refused with a clear reason', () => {
  assert.equal(validateEdit(wrong(), { requestedAmount: -5 }).error, 422);
  assert.equal(validateEdit(wrong(), { statedMonthlyIncome: 'abc' }).error, 422);
  assert.equal(validateEdit(wrong(), { employerName: '   ' }).error, 422);
  const term = validateEdit(wrong(), { repaymentTermMonths: 7 });
  assert.equal(term.error, 422);
  assert.match(term.message, /24, 36, 48, 60/);
});

test('the affordability ceiling still applies, even when only income or term is edited', () => {
  // A $15,000 request needs income of at least ~$2,083/mo over 36 months at 20%.
  const r = validateEdit(wrong(), { statedMonthlyIncome: 1500 });
  assert.equal(r.error, 422);
  assert.match(r.message, /maximum you can request/);
  assert.match(r.message, /same edit/);
  assert.equal(validateEdit(wrong(), { statedMonthlyIncome: 1500, requestedAmount: 9000 }).error, undefined);
  assert.equal(validateEdit(wrong(), { requestedAmount: 40000 }).error, 422, 'above the personal-loan cap');
});

test('a small-business application is checked against its revenue ceiling', () => {
  const biz = { ...wrong(), productType: 'small-business-loan', businessName: 'Acme LLC', statedAnnualBusinessRevenue: 340000, requestedAmount: 100000 };
  assert.equal(validateEdit(biz, { businessName: 'Acme Bakery LLC' }).error, undefined);
  assert.equal(validateEdit(biz, { statedAnnualBusinessRevenue: 100000 }).error, 422);
});

test('sending nothing, or only unchanged values, is "nothing changed"', () => {
  assert.equal(validateEdit(wrong(), {}).error, 400);
  assert.match(validateEdit(wrong(), { statedMonthlyIncome: 4533, employerName: 'test' }).message, /Nothing changed/);
});

test('unchanged values sent along with a real change are left out of the record', () => {
  const r = validateEdit(wrong(), { statedMonthlyIncome: 7200, employerName: 'test' });
  assert.deepEqual(Object.keys(r.updates), ['statedMonthlyIncome']);
  assert.equal(r.diff.length, 1);
  assert.equal(r.diff[0].label, 'Stated monthly income');
  assert.equal(r.diff[0].kind, 'money');
});
