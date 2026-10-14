import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreField, scoreExtraction, scoreFile, aggregate, moneyTolerance, toIsoDate, SCORED_FIELDS,
} from '../../src/scripts/benchScoring.js';

const truth = {
  fullName: 'Marcus A. Delgado', employerName: 'Cobalt Ridge Staffing Inc.', grossMonthlyIncome: 7292.0,
  payPeriod: '08/31/2026 - 09/13/2026', address: '119 Birchwood Lane, Mobile, AL 36602', ssnLast4: null,
  documentDate: '2026-09-18', netPay: 2584.0, grossPayPeriod: 3365.38, socialSecurityWithheld: 208.65,
  medicareWithheld: 48.8, ytdGrossPay: 60576.84, payPeriodNumber: 18,
};

test('money tolerance is max($0.02, 0.5%)', () => {
  assert.equal(moneyTolerance(1), 0.02); // floor
  assert.equal(moneyTolerance(100), 0.5); // 0.5% wins above $4
  assert.equal(moneyTolerance(10000), 50);
  assert.equal(scoreField('netPay', 2584, 2584.02).status, 'pass');
  assert.equal(scoreField('netPay', 2584, 2584.5).status, 'pass'); // within 0.5% = 12.92
  assert.equal(scoreField('netPay', 2584, 2600).status, 'fail');
  assert.equal(scoreField('medicareWithheld', 2.0, 2.03).status, 'fail'); // 0.03 > 0.02 floor
  assert.equal(scoreField('medicareWithheld', 2.0, 2.02).status, 'pass');
  assert.equal(scoreField('medicareWithheld', 48.8, 49.0).status, 'pass'); // 0.5% = 0.244
  assert.equal(scoreField('netPay', 2584, '$2,584.00').status, 'pass'); // string money tolerated
  assert.equal(scoreField('netPay', 2584, 'abc').status, 'fail');
});

test('null truth: only null passes, a value is a hallucination', () => {
  assert.equal(scoreField('ssnLast4', null, null).status, 'pass');
  assert.equal(scoreField('ssnLast4', null, undefined).status, 'pass');
  assert.equal(scoreField('ssnLast4', null, '').status, 'pass');
  assert.equal(scoreField('ssnLast4', null, '1234').status, 'hallucination');
  assert.equal(scoreField('socialSecurityWithheld', null, 0).status, 'hallucination');
  assert.equal(scoreField('payPeriodNumber', null, 7).status, 'hallucination');
});

test('non-null truth returned as null is a plain fail, not a hallucination', () => {
  assert.equal(scoreField('netPay', 100, null).status, 'fail');
  assert.equal(scoreField('fullName', 'A B', null).status, 'fail');
});

test('fullName is order-insensitive and ignores punctuation / middle initials', () => {
  assert.equal(scoreField('fullName', 'Marcus A. Delgado', 'DELGADO, MARCUS A').status, 'pass');
  assert.equal(scoreField('fullName', 'Marcus A. Delgado', 'Marcus Delgado').status, 'pass');
  assert.equal(scoreField('fullName', 'Jamal Tran-Whitfield', 'Whitfield Tran Jamal').status, 'pass');
  assert.equal(scoreField('fullName', 'Marcus A. Delgado', 'Marcos Delgado').status, 'fail');
  assert.equal(scoreField('fullName', 'Marcus A. Delgado', 'Delgado').status, 'fail');
});

test('strings: case / punctuation / whitespace insensitive; address and employer may contain', () => {
  assert.equal(scoreField('employerName', 'Maple & Vine Cafe LLC', 'MAPLE VINE CAFE, LLC').status, 'pass');
  assert.equal(scoreField('employerName', 'Maple & Vine Cafe LLC', 'Maple & Vine Cafe').status, 'pass');
  assert.equal(scoreField('employerName', 'Maple & Vine Cafe LLC', 'Other Corp').status, 'fail');
  assert.equal(scoreField('address', '119 Birchwood Lane, Mobile, AL 36602', '119 Birchwood Lane Mobile AL 36602').status, 'pass');
  assert.equal(scoreField('address', '119 Birchwood Lane, Mobile, AL 36602', '120 Birchwood Lane, Mobile, AL 36602').status, 'fail');
});

test('payPeriod accepts wording differences but not different dates', () => {
  assert.equal(scoreField('payPeriod', '08/31/2026 - 09/13/2026', 'Bi-weekly 08/31/2026 - 09/13/2026').status, 'pass');
  assert.equal(scoreField('payPeriod', '08/31/2026 - 09/13/2026', '08/31/2026 to 09/13/2026').status, 'pass');
  assert.equal(scoreField('payPeriod', '08/31/2026 - 09/13/2026', '09/01/2026 - 09/14/2026').status, 'fail');
});

test('ssnLast4, ints and dates', () => {
  assert.equal(scoreField('ssnLast4', '7816', 'XXX-XX-7816').status, 'pass');
  assert.equal(scoreField('ssnLast4', '7816', '7817').status, 'fail');
  assert.equal(scoreField('payPeriodNumber', 18, 18).status, 'pass');
  assert.equal(scoreField('payPeriodNumber', 18, '18').status, 'pass');
  assert.equal(scoreField('payPeriodNumber', 18, 18.5).status, 'fail');
  assert.equal(scoreField('payPeriodNumber', 18, 17).status, 'fail');
  assert.equal(toIsoDate('09/18/2026'), '2026-09-18');
  assert.equal(toIsoDate('Sep 18, 2026'), '2026-09-18');
  assert.equal(scoreField('documentDate', '2026-09-18', '09/18/2026').status, 'pass');
  assert.equal(scoreField('documentDate', '2026-09-18', '2026-09-13').status, 'fail');
});

test('scoreExtraction: perfect input scores 100%, hallucinations are counted', () => {
  const perfect = scoreExtraction(truth, truth);
  assert.equal(perfect.pass, SCORED_FIELDS.length);
  assert.equal(perfect.hallucinations, 0);
  const halluc = scoreExtraction(truth, { ...truth, ssnLast4: '1234', ein: '12-3456789' });
  assert.equal(halluc.hallucinations, 1);
  assert.equal(halluc.pass, SCORED_FIELDS.length - 1);
  assert.deepEqual(halluc.strayFields, ['ein']);
});

test('fallback / mock / missing results are failed calls, never correct', () => {
  const entry = { docType: 'pay-stub', fields: truth };
  for (const src of ['fallback', 'mock', undefined]) {
    const s = scoreFile(entry, { docType: 'pay-stub', fields: truth, extractionSource: src });
    assert.equal(s.failed, true);
    assert.equal(s.pass, 0);
  }
  assert.equal(scoreFile(entry, null, 'boom').error, 'boom');
  assert.equal(scoreFile(entry, { docType: 'pay-stub', fields: truth, extractionSource: 'live' }).failed, false);
});

test('aggregate keeps failed calls out of accuracy but reports them', () => {
  const entry = { docType: 'pay-stub', fields: truth };
  const good = scoreFile(entry, { docType: 'pay-stub', fields: truth, extractionSource: 'live' });
  const failed = scoreFile(entry, { extractionSource: 'fallback' });
  const wrongNet = scoreFile(entry, { docType: 'pay-stub', fields: { ...truth, netPay: 1 }, extractionSource: 'live' });
  const agg = aggregate([
    { file: 'a', layout: 'x', score: good },
    { file: 'b', layout: 'x', score: failed },
    { file: 'c', layout: 'y', score: wrongNet },
  ]);
  assert.equal(agg.failedCalls, 1);
  assert.equal(agg.scoredFiles, 2);
  assert.equal(agg.perField.netPay.pass, 1);
  assert.equal(agg.perField.netPay.total, 2);
  assert.equal(agg.perLayout.x.pct, 100);
  assert.equal(agg.perLayout.y.pct, Math.round((12 / 13) * 1000) / 10);
  assert.ok(agg.effectiveOverall.pct < agg.overall.pct);
});
