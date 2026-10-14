// Pure scoring logic for the pay-stub extraction benchmark (no I/O, no network).
// Kept separate from benchExtraction.js so it can be unit tested
// (backend/test/bench/benchScoring.test.js) and exercised by `--dry-run`.

export const MONEY_FIELDS = [
  'grossMonthlyIncome', 'netPay', 'grossPayPeriod', 'socialSecurityWithheld', 'medicareWithheld', 'ytdGrossPay',
];

// field -> comparison kind
export const FIELD_KINDS = {
  fullName: 'name',
  employerName: 'contains',
  grossMonthlyIncome: 'money',
  payPeriod: 'period',
  address: 'contains',
  ssnLast4: 'last4',
  documentDate: 'date',
  netPay: 'money',
  grossPayPeriod: 'money',
  socialSecurityWithheld: 'money',
  medicareWithheld: 'money',
  ytdGrossPay: 'money',
  payPeriodNumber: 'int',
};

export const SCORED_FIELDS = Object.keys(FIELD_KINDS);

// Fields the extractor contract has but a pay stub must leave null. Not part
// of the accuracy score; a non-null value is reported as a "stray" field.
export const OFF_CONTRACT_FIELDS = [
  'businessName', 'ein', 'annualBusinessRevenue', 'ownershipPercent', 'recentDepositAmount', 'recentDepositSource',
];

export function isNil(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Money is correct within max($0.02, 0.5% of the true value).
export function moneyTolerance(truth) {
  return Math.max(0.02, Math.abs(truth) * 0.005);
}

export function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

// lowercase, drop everything that is not a letter or digit
export function normalizeText(v) {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Name tokens: lowercase, split on any non-alphanumeric (so "Tran-Whitfield" and
// "Whitfield, Tran" both work), drop single-letter tokens (middle initials), sort.
export function nameTokens(v) {
  return String(v ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .sort();
}

function digitRuns(v) {
  return (String(v ?? '').match(/\d+/g) || []).map((d) => String(Number(d)));
}

function containsSeq(hay, needle) {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((x, j) => hay[i + j] === x)) return true;
  }
  return false;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Best-effort conversion of the date formats a model might return to ISO yyyy-mm-dd.
// "03/13/2026" is read as US month/day/year (the repo's mock fixtures use that).
export function toIsoDate(v) {
  if (isNil(v)) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Score a single field. Returns { status: 'pass' | 'fail' | 'hallucination', expected, actual, reason }.
//   - truth null  -> pass only if the model returned null; any value is a 'hallucination'
//   - truth value -> 'fail' if the model returned null or a wrong value
export function scoreField(field, truth, pred) {
  const kind = FIELD_KINDS[field];
  if (!kind) throw new Error(`scoreField: unknown field "${field}"`);
  const base = { expected: truth ?? null, actual: pred === undefined ? null : pred };

  if (isNil(truth)) {
    return isNil(pred)
      ? { ...base, actual: null, status: 'pass', reason: 'correctly null' }
      : { ...base, status: 'hallucination', reason: 'value returned where the document prints none' };
  }
  if (isNil(pred)) return { ...base, actual: null, status: 'fail', reason: 'returned null' };

  const ok = (reason = 'match') => ({ ...base, status: 'pass', reason });
  const bad = (reason) => ({ ...base, status: 'fail', reason });

  switch (kind) {
    case 'money': {
      const p = parseMoney(pred);
      if (p === null) return bad('not a number');
      const tol = moneyTolerance(truth);
      return Math.abs(p - truth) <= tol + 1e-9 ? ok() : bad(`off by ${(p - truth).toFixed(2)} (tolerance ${tol.toFixed(2)})`);
    }
    case 'int': {
      const p = typeof pred === 'string' && /^\s*\d+\s*$/.test(pred) ? Number(pred) : pred;
      return Number.isInteger(p) && p === truth ? ok() : bad('integer mismatch');
    }
    case 'name': {
      const a = nameTokens(truth);
      const b = nameTokens(pred);
      return a.length > 0 && a.length === b.length && a.every((t, i) => t === b[i]) ? ok() : bad('name tokens differ');
    }
    case 'contains': {
      const a = normalizeText(truth);
      const b = normalizeText(pred);
      if (a === b) return ok();
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      return short.length >= 4 && long.includes(short) ? ok('contained') : bad('text differs');
    }
    case 'period': {
      const a = normalizeText(truth);
      const b = normalizeText(pred);
      if (a === b || (a.length >= 6 && b.includes(a))) return ok();
      // tolerate "to"/"through" wording, reordered punctuation, extra text like "Bi-weekly"
      return containsSeq(digitRuns(pred), digitRuns(truth)) ? ok('same dates') : bad('dates differ');
    }
    case 'last4': {
      const digits = String(pred).replace(/\D/g, '');
      return digits.length >= 4 && digits.slice(-4) === String(truth) ? ok() : bad('last 4 differ');
    }
    case 'date': {
      const p = toIsoDate(pred);
      const t = toIsoDate(truth) ?? String(truth);
      return (p ?? normalizeText(pred)) === t || normalizeText(pred) === normalizeText(truth) ? ok() : bad('date differs');
    }
    default:
      throw new Error(`unhandled kind ${kind}`);
  }
}

// Score all fields of one extraction against the truth object.
export function scoreExtraction(truthFields, predFields) {
  const pf = predFields && typeof predFields === 'object' ? predFields : {};
  const fields = {};
  let pass = 0;
  let hallucinations = 0;
  for (const f of SCORED_FIELDS) {
    const r = scoreField(f, truthFields[f], pf[f]);
    fields[f] = r;
    if (r.status === 'pass') pass += 1;
    if (r.status === 'hallucination') hallucinations += 1;
  }
  const stray = OFF_CONTRACT_FIELDS.filter((f) => !isNil(pf[f]));
  return { fields, pass, total: SCORED_FIELDS.length, hallucinations, strayFields: stray };
}

// A call only counts as an extraction if the live model produced it. Anything
// else (fallback/mock tag, thrown error, missing result) is a FAILED call,
// never a correct or incorrect answer.
export function isLiveResult(result) {
  return !!result && result.extractionSource === 'live';
}

export function scoreFile(entry, result, error = null) {
  if (!isLiveResult(result)) {
    return {
      failed: true,
      error: error || (result ? `extractionSource=${result.extractionSource}` : 'no result'),
      fields: null, pass: 0, total: SCORED_FIELDS.length, hallucinations: 0, strayFields: [], docTypeOk: false,
    };
  }
  const s = scoreExtraction(entry.fields, result.fields);
  return { failed: false, error: null, ...s, docTypeOk: result.docType === entry.docType };
}

const pct = (a, b) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);

// `items` = [{ file, layout, score }] for the files that count toward accuracy.
// Accuracy is computed over successful (live) calls; `effectiveOverall` also
// charges every field of every failed call as wrong.
export function aggregate(items) {
  const perField = Object.fromEntries(SCORED_FIELDS.map((f) => [f, { pass: 0, total: 0, hallucinations: 0 }]));
  const perLayout = {};
  let pass = 0;
  let total = 0;
  let hallucinations = 0;
  let failedCalls = 0;
  let docTypeWrong = 0;
  let strayFields = 0;
  for (const { layout, score } of items) {
    const L = (perLayout[layout] ||= { files: 0, failedCalls: 0, pass: 0, total: 0 });
    L.files += 1;
    if (score.failed) {
      failedCalls += 1;
      L.failedCalls += 1;
      continue;
    }
    for (const f of SCORED_FIELDS) {
      const r = score.fields[f];
      perField[f].total += 1;
      if (r.status === 'pass') perField[f].pass += 1;
      if (r.status === 'hallucination') perField[f].hallucinations += 1;
    }
    pass += score.pass;
    total += score.total;
    L.pass += score.pass;
    L.total += score.total;
    hallucinations += score.hallucinations;
    if (!score.docTypeOk) docTypeWrong += 1;
    strayFields += score.strayFields.length;
  }
  for (const f of SCORED_FIELDS) perField[f].pct = pct(perField[f].pass, perField[f].total);
  for (const L of Object.values(perLayout)) L.pct = pct(L.pass, L.total);
  const allFields = items.length * SCORED_FIELDS.length;
  return {
    files: items.length,
    failedCalls,
    scoredFiles: items.length - failedCalls,
    overall: { pass, total, pct: pct(pass, total) },
    effectiveOverall: { pass, total: allFields, pct: pct(pass, allFields) },
    hallucinations,
    docTypeWrong,
    strayFields,
    perField,
    perLayout,
  };
}
