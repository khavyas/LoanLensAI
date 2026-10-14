import test from 'node:test';
import assert from 'node:assert/strict';
import { crossDocumentChecks, verifyDocument } from '../../src/services/verification.js';

const app = { applicantName: 'Jordan Rivera', employerName: 'Brightline Logistics', statedMonthlyIncome: 4200 };
const stub = (extra = {}) => ({
  docType: 'pay-stub', status: 'current',
  extractedFields: { employerName: 'Brightline Logistics', netPay: 1480.02, ...extra },
});
const statement = (credits, extra = {}) => ({
  docType: 'bank-statement', status: 'current',
  extractedFields: {},
  statementSummary: { pagesScanned: 153, credits, payrollLikeDeposits: credits.filter((c) => /payroll|direct dep/i.test(c.description)), ...extra },
});
const deposit = (date, amount, description = 'BRIGHTLINE LOGISTICS PAYROLL DIRECT DEP') => ({ date, amount, description });
const depositCheck = (docs) => crossDocumentChecks(app, docs).find((c) => c.field === 'Bank deposit vs. pay stub net pay');

test('a matching payroll deposit anywhere in the statement corroborates the stub', () => {
  const credits = [deposit('2026-03-06', 1480.02), deposit('2026-03-20', 1480.02)];
  assert.equal(depositCheck([stub(), statement(credits)]).status, 'match');
});

test('a split direct deposit that sums to net pay is recognised as a match', () => {
  const credits = [deposit('2026-05-01', 1000.0), deposit('2026-05-01', 480.02)];
  const check = depositCheck([stub(), statement(credits)]);
  assert.equal(check.status, 'match');
  assert.match(check.explanation, /split/i);
});

test('employer deposits that never add up to net pay are a warning, not a mismatch', () => {
  const credits = [deposit('2026-05-01', 700.0), deposit('2026-05-15', 700.0)];
  const check = depositCheck([stub(), statement(credits)]);
  assert.equal(check.status, 'warning');
  assert.match(check.explanation, /other account/i);
});

test('no payroll deposit found is shown as a warning instead of being skipped silently', () => {
  const credits = [deposit('2026-05-01', 55.0, 'ZELLE FROM A FRIEND CREDIT')];
  const check = depositCheck([stub(), statement(credits)]);
  assert.equal(check.status, 'warning');
  assert.match(check.found, /no payroll deposit found in 153 pages/);
});

test('single-deposit path (image / scanned file) never hard-fails and notes unread pages', () => {
  const bank = {
    docType: 'bank-statement', status: 'current',
    extractedFields: { recentDepositAmount: 740.01, recentDepositSource: 'BRIGHTLINE PAYROLL' },
    pageInfo: { total: 153, aiRead: 1 },
  };
  const check = depositCheck([stub(), bank]);
  assert.equal(check.status, 'warning');
  assert.match(check.explanation, /Only page 1 of 153/);
});

test('single-deposit path with no deposit read is surfaced, not skipped', () => {
  const bank = { docType: 'bank-statement', status: 'current', extractedFields: {}, pageInfo: { total: 153, aiRead: 1 } };
  assert.equal(depositCheck([stub(), bank]).status, 'warning');
});

const payStubFields = (over = {}) => ({
  fields: { grossPayPeriod: 2000, socialSecurityWithheld: 124, medicareWithheld: 29, ...over },
  confidence: 0.95,
});

test('correct Social Security and Medicare withholding matches', () => {
  const { checks, overall } = verifyDocument(app, payStubFields());
  assert.ok(checks.filter((c) => /withholding/.test(c.field)).every((c) => c.status === 'match'));
  assert.equal(overall, 'pass');
});

test('edited gross pay is flagged for review, never as a hard failure', () => {
  const { checks, overall } = verifyDocument(app, payStubFields({ grossPayPeriod: 2800 }));
  const ss = checks.find((c) => c.field.startsWith('Social Security'));
  assert.equal(ss.status, 'warning');
  assert.notEqual(overall, 'fail');
});

test('pre-tax benefits: both FICA lines agreeing on a lower base is explained as typical', () => {
  // $2000 gross, $200 pre-tax health premium -> FICA base $1800
  const { checks } = verifyDocument(app, payStubFields({ socialSecurityWithheld: 111.6, medicareWithheld: 26.1 }));
  const ss = checks.find((c) => c.field.startsWith('Social Security'));
  assert.equal(ss.status, 'warning');
  assert.match(ss.explanation, /pre-tax benefits are deducted/);
});

test('year-to-date inconsistency is a warning that names legitimate causes', () => {
  const { checks, overall } = verifyDocument(app, payStubFields({ grossPayPeriod: 3000, ytdGrossPay: 20000, payPeriodNumber: 10 }));
  const ytd = checks.find((c) => c.field.startsWith('Year-to-date'));
  assert.equal(ytd.status, 'warning');
  assert.match(ytd.explanation, /recent hire/);
  assert.notEqual(overall, 'fail');
});
