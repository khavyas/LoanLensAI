// Pay-stub extraction benchmark.
//
//   cd backend && node src/scripts/benchExtraction.js            (needs GROQ_API_KEY)
//   cd backend && node src/scripts/benchExtraction.js --dry-run  (no API: ground truth -> scorer, expects 100%)
//
// Options:
//   --dry-run        feed the ground truth through the scorer instead of calling Groq
//   --fake-errors    (with --dry-run) inject failed calls, a wrong value and a hallucination so the
//                    reporting paths are exercised; accuracy is then intentionally < 100%
//   --limit=N        only the first N files
//   --only=a,b       only these file names
// Env: BENCH_DELAY_MS (default 2500) pause between files, BENCH_RETRY_BASE_MS (default 8000) first retry backoff.
//
// classifyAndExtractGroq() swallows every error and returns canned mock data tagged
// extractionSource:'fallback'. Those results are FAILED calls here, never extractions.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCORED_FIELDS, OFF_CONTRACT_FIELDS, scoreFile, aggregate, moneyTolerance, parseMoney, isLiveResult,
} from './benchScoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = path.resolve(__dirname, '../../../data/bench/paystubs');
const FILES_DIR = path.join(BENCH_DIR, 'files');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || null;
const DRY = flag('dry-run');
const FAKE_ERRORS = flag('fake-errors');
const DELAY_MS = Number(process.env.BENCH_DELAY_MS ?? 2500);
const RETRY_BASE_MS = Number(process.env.BENCH_RETRY_BASE_MS ?? 8000);
const MAX_RETRIES = 2;
const RATE_LIMIT_RE = /429|rate.?limit|too many requests|quota|tokens per (minute|day)|try again in/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mimeFor = (f) => (f.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- calling the extractor

let liveExtractor = null;
let modelName = null;

async function initLive() {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Put it in backend/.env or the environment (or use --dry-run).');
    process.exit(2);
  }
  if (process.env.MOCK_AI === 'true') {
    console.error('MOCK_AI=true would make every call return mock data. Unset it for the benchmark.');
    process.exit(2);
  }
  ({ classifyAndExtractGroq: liveExtractor } = await import('../services/extractionGroq.js'));
  ({ GROQ_MODEL: modelName } = await import('../services/groqClient.js'));
}

// extractionGroq logs the real failure with console.error and then returns fallback data,
// so capture that message to know WHY a call failed (and whether to retry on rate limits).
async function callOnce(file) {
  const captured = [];
  const orig = console.error;
  console.error = (...a) => {
    captured.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '));
  };
  try {
    const result = await liveExtractor(path.join(FILES_DIR, file), mimeFor(file), file);
    return { result, error: captured.join(' | ') || null };
  } catch (err) {
    return { result: null, error: err.message };
  } finally {
    console.error = orig;
  }
}

async function callWithRetry(file) {
  let attempt = 0;
  for (;;) {
    const { result, error } = await callOnce(file);
    if (isLiveResult(result)) return { result, error: null, attempts: attempt + 1 };
    if (attempt < MAX_RETRIES && error && RATE_LIMIT_RE.test(error)) {
      const hinted = error.match(/try again in ([\d.]+)\s*(ms|s)/i);
      const hintMs = hinted ? Math.ceil(Number(hinted[1]) * (hinted[2].toLowerCase() === 'ms' ? 1 : 1000)) + 500 : 0;
      const wait = Math.max(RETRY_BASE_MS * 2 ** attempt, hintMs);
      console.log(`  rate limited on ${file}; retry ${attempt + 1}/${MAX_RETRIES} in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      attempt += 1;
      continue;
    }
    return { result, error: error || 'extraction did not return a live result', attempts: attempt + 1 };
  }
}

function dryRunResult(file, entry, index) {
  if (FAKE_ERRORS && index % 7 === 3) {
    return { result: { docType: 'unknown', fields: {}, extractionSource: 'fallback' }, error: 'fake error (--fake-errors)', attempts: 1 };
  }
  const fields = { ...entry.fields };
  if (FAKE_ERRORS && index % 7 === 1 && fields.netPay != null) fields.netPay += 25; // wrong value
  if (FAKE_ERRORS && index % 7 === 5) {
    if (fields.ssnLast4 == null) fields.ssnLast4 = '1234';
    else if (fields.ytdGrossPay == null) fields.ytdGrossPay = 12345.67; // hallucination
  }
  return { result: { docType: entry.docType, confidence: 1, fields, extractionSource: 'live' }, error: null, attempts: 1 };
}

// ---------------------------------------------------------------- reporting helpers

const ABBR = {
  fullName: 'name', employerName: 'empl', grossMonthlyIncome: 'mGrs', payPeriod: 'per', address: 'addr',
  ssnLast4: 'ssn4', documentDate: 'date', netPay: 'net', grossPayPeriod: 'gross', socialSecurityWithheld: 'ss',
  medicareWithheld: 'med', ytdGrossPay: 'ytd', payPeriodNumber: 'pNo',
};
const cell = (score, f) => {
  if (score.failed) return 'ERR';
  const s = score.fields[f].status;
  return s === 'pass' ? 'ok' : s === 'hallucination' ? 'HAL' : 'XX';
};
const fmtPct = (p) => (p === null || p === undefined ? '  n/a' : `${p.toFixed(1)}%`.padStart(6));
const show = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : JSON.stringify(v));

function renderTable(rows) {
  const w = 5;
  const head = `${'file'.padEnd(17)}${'layout'.padEnd(21)}${SCORED_FIELDS.map((f) => ABBR[f].padStart(w)).join('')}  score`;
  const lines = [head, '-'.repeat(head.length)];
  for (const r of rows) {
    const cells = SCORED_FIELDS.map((f) => cell(r.score, f).padStart(w)).join('');
    const sc = r.score.failed ? 'FAILED CALL' : `${r.score.pass}/${r.score.total}`;
    lines.push(`${r.file.padEnd(17)}${r.layout.padEnd(21)}${cells}  ${sc}`);
  }
  return lines.join('\n');
}

function tamperedView(entry, result) {
  const keys = ['grossPayPeriod', 'grossMonthlyIncome', 'netPay', 'socialSecurityWithheld', 'medicareWithheld', 'ytdGrossPay'];
  const live = isLiveResult(result);
  const rows = keys.map((k) => {
    const printed = entry.fields[k];
    const got = live ? result.fields?.[k] ?? null : undefined;
    const p = parseMoney(got);
    const matches = live && printed != null && p !== null && Math.abs(p - printed) <= moneyTolerance(printed);
    return { field: k, printed, extracted: live ? got : 'FAILED CALL', matchesPrinted: live ? matches : null };
  });
  const g = parseMoney(live ? result.fields?.grossPayPeriod : null);
  const ss = parseMoney(live ? result.fields?.socialSecurityWithheld : null);
  return {
    rows,
    extractedSsPctOfGross: g && ss ? Math.round((ss / g) * 10000) / 100 : null,
    printedSsPctOfGross: entry.fields.socialSecurityWithheld
      ? Math.round((entry.fields.socialSecurityWithheld / entry.fields.grossPayPeriod) * 10000) / 100 : null,
    originalGross: entry.meta.originalGrossPayPeriod,
  };
}

function renderMarkdown(report) {
  const { summary: s, config } = report;
  const out = [];
  out.push(`# Pay-stub extraction benchmark${config.dryRun ? ' (DRY RUN - scorer check only)' : ''}`, '');
  out.push(`- Run: ${config.startedAt}`, `- Model: ${config.model ?? 'n/a (dry run)'}`,
    `- Files scored: ${s.files} (tampered files excluded: ${report.tampered.length})`,
    `- Failed calls (fallback/mock/error, excluded from accuracy): **${s.failedCalls}**`,
    `- Overall accuracy over successful calls: **${s.overall.pct ?? 'n/a'}%** (${s.overall.pass}/${s.overall.total} fields)`,
    `- Effective accuracy counting failed calls as all-wrong: ${s.effectiveOverall.pct ?? 'n/a'}%`,
    `- Hallucinations (value returned where the stub prints none): **${s.hallucinations}**`,
    `- docType not "pay-stub": ${s.docTypeWrong}; non-null off-contract fields: ${s.strayFields}`, '');
  out.push('## Per-field accuracy', '', '| field | pass | total | accuracy | hallucinations |', '|---|---|---|---|---|');
  for (const f of SCORED_FIELDS) {
    const x = s.perField[f];
    out.push(`| ${f} | ${x.pass} | ${x.total} | ${x.pct ?? 'n/a'}% | ${x.hallucinations} |`);
  }
  out.push('', '## Per-layout-family accuracy', '', '| layout | files | failed calls | pass/total | accuracy |', '|---|---|---|---|---|');
  for (const [name, L] of Object.entries(s.perLayout).sort()) {
    out.push(`| ${name} | ${L.files} | ${L.failedCalls} | ${L.pass}/${L.total} | ${L.pct ?? 'n/a'}% |`);
  }
  out.push('', '## File x field', '', '`ok` correct, `XX` wrong or missed, `HAL` hallucination, `ERR` failed call', '',
    `| file | layout | ${SCORED_FIELDS.map((f) => ABBR[f]).join(' | ')} | score |`,
    `|---|---|${SCORED_FIELDS.map(() => '---').join('|')}|---|`);
  for (const r of report.files) {
    out.push(`| ${r.file} | ${r.layout} | ${SCORED_FIELDS.map((f) => cell(r.score, f)).join(' | ')} | ${r.score.failed ? 'FAILED' : `${r.score.pass}/${r.score.total}`} |`);
  }
  const misses = [];
  for (const r of report.files) {
    if (r.score.failed) continue;
    for (const f of SCORED_FIELDS) {
      const x = r.score.fields[f];
      if (x.status !== 'pass') misses.push(`| ${r.file} | ${f} | ${x.status} | ${show(x.expected)} | ${show(x.actual)} | ${x.reason} |`);
    }
  }
  out.push('', '## Wrong / hallucinated fields', '');
  if (misses.length) out.push('| file | field | status | expected | extracted | note |', '|---|---|---|---|---|---|', ...misses);
  else out.push('None.');
  const failedCalls = report.files.filter((r) => r.score.failed);
  out.push('', '## Failed calls', '');
  if (failedCalls.length) {
    out.push('| file | attempts | error |', '|---|---|---|', ...failedCalls.map((r) => `| ${r.file} | ${r.attempts} | ${String(r.score.error).replace(/\|/g, '/').slice(0, 200)} |`));
  } else out.push('None.');
  out.push('', '## Tampered files (not part of the accuracy score)', '',
    'Gross pay was raised 25-40% while Social Security, Medicare and YTD were left unchanged. "printed" is what the stub shows.', '');
  for (const t of report.tampered) {
    out.push(`### ${t.file} (copy of ${t.tamperedFrom}, original gross ${t.view.originalGross})`, '',
      '| field | printed | extracted | matches printed |', '|---|---|---|---|');
    for (const r of t.view.rows) out.push(`| ${r.field} | ${show(r.printed)} | ${show(r.extracted)} | ${r.matchesPrinted === null ? 'n/a' : r.matchesPrinted} |`);
    out.push('', `Printed SS / gross = ${t.view.printedSsPctOfGross}% ; extracted SS / gross = ${t.view.extractedSsPctOfGross ?? 'n/a'}% (statutory 6.2%)`, '');
  }
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------- main

async function main() {
  const truth = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'ground_truth.json'), 'utf8'));
  let names = Object.keys(truth).sort();
  if (opt('only')) names = names.filter((n) => opt('only').split(',').includes(n));
  if (opt('limit')) names = names.slice(0, Number(opt('limit')));
  if (!names.length) {
    console.error('No files selected.');
    process.exit(2);
  }
  if (!DRY) await initLive();
  const startedAt = new Date().toISOString();
  console.log(`${DRY ? 'DRY RUN' : `Live run, model ${modelName}`}: ${names.length} files, delay ${DELAY_MS}ms${FAKE_ERRORS ? ', fake errors on' : ''}\n`);

  const files = [];
  const tampered = [];
  for (let i = 0; i < names.length; i += 1) {
    const file = names[i];
    const entry = truth[file];
    const { result, error, attempts } = DRY ? dryRunResult(file, entry, i) : await callWithRetry(file);
    const score = scoreFile(entry, result, error);
    const layout = entry.meta.layout;
    console.log(`[${String(i + 1).padStart(2)}/${names.length}] ${file}  ${entry.meta.tampered ? '(tampered) ' : ''}${score.failed ? `FAILED: ${String(score.error).slice(0, 120)}` : `${score.pass}/${score.total}`}`);
    const rec = { file, layout, frequency: entry.meta.frequency, attempts, extractionSource: result?.extractionSource ?? null, score, raw: result };
    if (entry.meta.tampered) {
      tampered.push({ file, tamperedFrom: entry.meta.tamperedFrom, view: tamperedView(entry, result), score, raw: result, truth: entry.fields });
    } else {
      files.push(rec);
    }
    if (!DRY && i < names.length - 1) await sleep(DELAY_MS);
  }

  const summary = aggregate(files.map((r) => ({ file: r.file, layout: r.layout, score: r.score })));
  console.log(`\n${renderTable(files)}\n`);
  console.log('Per-field accuracy (successful calls only):');
  for (const f of SCORED_FIELDS) {
    const x = summary.perField[f];
    console.log(`  ${f.padEnd(24)} ${fmtPct(x.pct)}  (${x.pass}/${x.total})${x.hallucinations ? `  hallucinations: ${x.hallucinations}` : ''}`);
  }
  console.log('\nPer-layout-family accuracy:');
  for (const [name, L] of Object.entries(summary.perLayout).sort()) {
    console.log(`  ${name.padEnd(24)} ${fmtPct(L.pct)}  (${L.pass}/${L.total}, ${L.files} files${L.failedCalls ? `, ${L.failedCalls} failed calls` : ''})`);
  }
  console.log(`\nOVERALL accuracy: ${summary.overall.pct ?? 'n/a'}%  (${summary.overall.pass}/${summary.overall.total} fields over ${summary.scoredFiles} successful calls)`);
  console.log(`Effective accuracy counting failed calls as wrong: ${summary.effectiveOverall.pct ?? 'n/a'}%`);
  console.log(`Failed calls (fallback/mock/error): ${summary.failedCalls}`);
  console.log(`Hallucinations: ${summary.hallucinations}`);
  console.log(`docType != pay-stub: ${summary.docTypeWrong}   off-contract non-null fields: ${summary.strayFields}`);

  if (tampered.length) {
    console.log('\nTAMPERED files (excluded from accuracy) - printed vs extracted:');
    for (const t of tampered) {
      console.log(`  ${t.file} (copy of ${t.tamperedFrom}; original gross ${t.view.originalGross})`);
      for (const r of t.view.rows) {
        console.log(`    ${r.field.padEnd(24)} printed ${show(r.printed).padEnd(10)} extracted ${show(r.extracted).padEnd(12)} ${r.matchesPrinted === null ? '' : r.matchesPrinted ? 'read as printed' : 'DIFFERS'}`);
      }
      console.log(`    SS/gross printed ${t.view.printedSsPctOfGross}%  extracted ${t.view.extractedSsPctOfGross ?? 'n/a'}%  (statutory 6.2%)`);
    }
  }

  const report = {
    config: { dryRun: DRY, fakeErrors: FAKE_ERRORS, model: modelName, delayMs: DELAY_MS, startedAt, scoredFields: SCORED_FIELDS, offContractFields: OFF_CONTRACT_FIELDS },
    summary,
    files,
    tampered,
  };
  const base = path.join(BENCH_DIR, `results_${DRY ? 'dryrun_' : ''}${stamp()}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`${base}.md`, renderMarkdown(report));
  console.log(`\nWrote ${path.relative(process.cwd(), `${base}.json`)} and .md`);

  if (DRY && !FAKE_ERRORS && (summary.overall.pct !== 100 || summary.failedCalls || summary.hallucinations)) {
    console.error('DRY RUN FAILED: scorer did not give 100% on the ground truth itself.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
