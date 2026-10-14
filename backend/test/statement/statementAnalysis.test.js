import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPdfPages } from '../../src/services/pdfText.js';
import { analyzeStatement, parseAmount, employerMatchesDescription } from '../../src/services/statementAnalysis.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../../data/bench/statements');
const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));

async function analyze(file) {
  const { pages, pagesTotal, pagesRead, textLayer } = await readPdfPages(fs.readFileSync(path.join(dir, file)));
  return { summary: analyzeStatement(pages, { pagesTotal }), pagesTotal, pagesRead, textLayer };
}

for (const file of ['statement_A_153p.pdf', 'statement_B_153p.pdf']) {
  test(`${file}: reads all pages and recovers every transaction and total`, async () => {
    const t = truth[file];
    const started = Date.now();
    const { summary, pagesTotal, pagesRead, textLayer } = await analyze(file);
    const seconds = (Date.now() - started) / 1000;
    console.log(`  ${file}: ${pagesRead}/${pagesTotal} pages in ${seconds.toFixed(1)}s, ${summary.transactionsFound} txns`);

    assert.equal(textLayer, true);
    assert.equal(pagesTotal, t.pages);
    assert.equal(pagesRead, t.pages);
    assert.equal(summary.transactionsFound, t.transactions);
    assert.equal(summary.unclassified, 0);
    assert.equal(summary.unparsedDatedLines, 0);
    assert.equal(summary.monthsCovered, 12);
    assert.equal(summary.totalCredits, t.totalCredits);
    assert.equal(summary.totalDebits, t.totalDebits);
    assert.equal(summary.avgMonthlyCredits, t.avgMonthlyCredits);
    assert.equal(summary.endingBalance, t.endingBalance);
    assert.equal(summary.overdraftCount, t.overdraftCount);
    const payroll = summary.credits.filter((c) => /BRIGHTLINE/.test(c.description));
    assert.equal(payroll.length, t.payrollDepositRows);
    assert.equal(Math.round(payroll.reduce((s, c) => s + c.amount, 0) * 100) / 100, t.payrollDepositTotal);
  });
}

test('statement_C (parentheses, no balance column) classifies by sign and keywords', async () => {
  const t = truth['statement_C_12p.pdf'];
  const { summary } = await analyze('statement_C_12p.pdf');
  assert.equal(summary.transactionsFound, t.transactions);
  assert.equal(summary.totalCredits, t.totalCredits);
  assert.equal(summary.totalDebits, t.totalDebits);
  assert.equal(summary.overdraftCount, t.overdraftCount);
});

test('amount parsing handles signs, parentheses and CR/DR', () => {
  assert.deepEqual(parseAmount('+$1,938.46'), { value: 1938.46, explicit: 1 });
  assert.deepEqual(parseAmount('-$118.20'), { value: 118.2, explicit: -1 });
  assert.deepEqual(parseAmount('(118.20)'), { value: 118.2, explicit: -1 });
  assert.deepEqual(parseAmount('1,000.00 CR'), { value: 1000, explicit: 1 });
  assert.deepEqual(parseAmount('45.10 DR'), { value: 45.1, explicit: -1 });
  assert.deepEqual(parseAmount('45.10'), { value: 45.1, explicit: 0 });
});

test('employer matching uses the distinctive name, not generic words', () => {
  assert.equal(employerMatchesDescription('BRIGHTLINE LOGISTICS PAYROLL', 'Brightline Logistics, Inc.'), true);
  assert.equal(employerMatchesDescription('ACME SYSTEMS PAYROLL', 'Cedar Health Systems'), false);
  assert.equal(employerMatchesDescription('ACH CREDIT CEDAR HEALTH', 'Cedar Health Systems'), true);
});
