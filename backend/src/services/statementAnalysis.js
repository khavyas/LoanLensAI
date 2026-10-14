// Turns the text of a bank-statement PDF (every page) into summary numbers.
// Pure functions: no I/O, no AI, no tokens. That is what makes a 150-page,
// 1000-transaction statement feasible on a free-tier setup - the AI model only
// reads page 1; the rest is ordinary text processing.
//
// Honest limits: this understands the common "date  description  amount
// [balance]" row shape, with signed, CR/DR, or separate debit/credit columns
// (the last resolved with the running balance). Statements laid out very
// differently, and scanned (image-only) PDFs, are reported as such rather than
// guessed at - see unparsedDatedLines and the textLayer flag set by the caller.

const DATE = String.raw`(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)`;
const AMOUNT = String.raw`(\(?[-+]?\$?\s?\d[\d,]*\.\d{2}\)?(?:\s?(?:CR|DR))?-?)`;
const TXN_LINE = new RegExp(`^${DATE}(?:\\s+${DATE})?\\s+(.+?)\\s+${AMOUNT}(?:\\s+${AMOUNT})?\\s*$`, 'i');
const STARTS_WITH_DATE_AND_AMOUNT = new RegExp(`^${DATE}\\b.*\\d[\\d,]*\\.\\d{2}`);

const PAYROLL_WORDS = /\b(payroll|direct\s*dep(?:osit)?|dir\s*dep|salary|wages|ppd|paycheck|pay\s*check)\b/i;
const OVERDRAFT_WORDS = /(overdraft|\bnsf\b|insufficient\s+funds|returned\s+(?:item|check)|\bod\s+fee\b|overdrawn)/i;
const CREDIT_WORDS = /\b(deposit|payroll|direct\s*dep|salary|credit|refund|interest\s+paid|transfer\s+from|zelle\s+from|payment\s+received)\b/i;
const DEBIT_WORDS = /\b(withdrawal|purchase|debit|payment\s+to|fee|check\s*#?\d*|pos|atm|transfer\s+to|zelle\s+to|bill\s*pay|autopay)\b/i;

const MAX_STORED_CREDITS = 500;
const MAX_PAYROLL_LIST = 24;

const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

export function parseAmount(raw) {
  const s = String(raw).trim();
  const negative = /^[\s$(]*-/.test(s) || /-\s*$/.test(s) || /^\(.*\)/.test(s) || /DR$/i.test(s);
  const positive = /^[\s$(]*\+/.test(s) || /CR$/i.test(s);
  return { value: Number(s.replace(/[^0-9.]/g, '')), explicit: negative ? -1 : positive ? 1 : 0 };
}

function signedMoney(raw) {
  const a = parseAmount(raw);
  return a.value * (a.explicit || 1);
}

function parseDate(raw, period) {
  const m = String(raw).match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return null;
  let month = Number(m[1]);
  let day = Number(m[2]);
  if (month > 12 && day <= 12) [month, day] = [day, month];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = null;
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  else if (period) {
    // A statement that crosses New Year prints dates without a year.
    year = period.startYear !== period.endYear && month >= period.startMonth ? period.startYear : period.endYear;
  }
  return {
    iso: year ? `${year}-${pad(month)}-${pad(day)}` : null,
    monthKey: year ? `${year}-${pad(month)}` : `--${pad(month)}`,
  };
}

function findPeriod(lines) {
  const re = /(\d{1,2})[/-]\d{1,2}[/-](\d{2,4})\s*(?:-|–|to|through)\s*(\d{1,2})[/-]\d{1,2}[/-](\d{2,4})/i;
  for (const { text } of lines) {
    if (!/period|statement/i.test(text)) continue;
    const m = text.match(re);
    if (!m) continue;
    const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));
    return { startMonth: Number(m[1]), startYear: fullYear(m[2]), endYear: fullYear(m[4]) };
  }
  return null;
}

function classify(a1, balance, prevBalance, description) {
  if (a1.explicit) return a1.explicit;
  if (balance != null && prevBalance != null) {
    const delta = round2(balance - prevBalance);
    if (Math.abs(delta - a1.value) < 0.011) return 1;
    if (Math.abs(delta + a1.value) < 0.011) return -1;
  }
  const credit = CREDIT_WORDS.test(description);
  const debit = DEBIT_WORDS.test(description);
  if (credit && !debit) return 1;
  if (debit && !credit) return -1;
  return 0;
}

export function analyzeStatement(pages, { pagesTotal } = {}) {
  const lines = pages.flatMap((pageLines, i) => pageLines.map((text) => ({ text, page: i + 1 })));
  const period = findPeriod(lines);

  let prevBalance = null;
  let endingBalanceLabelled = null;
  const txns = [];
  let unparsedDatedLines = 0;

  for (const { text, page } of lines) {
    const begin = text.match(/(?:beginning|opening|previous)\s+balance[^\d$-]*(-?\$?-?[\d,]+\.\d{2})/i);
    if (begin) prevBalance = signedMoney(begin[1]);
    const end = text.match(/(?:ending|closing)\s+balance[^\d$-]*(-?\$?-?[\d,]+\.\d{2})/i);
    if (end) endingBalanceLabelled = signedMoney(end[1]);

    const m = text.match(TXN_LINE);
    if (!m) {
      if (STARTS_WITH_DATE_AND_AMOUNT.test(text)) unparsedDatedLines += 1;
      continue;
    }
    const date = parseDate(m[1], period);
    if (!date) continue;

    const description = m[3].trim();
    const a1 = parseAmount(m[4]);
    const a2 = m[5] ? parseAmount(m[5]) : null;
    const balance = a2 ? signedMoney(m[5]) : null;
    const direction = classify(a1, balance, prevBalance, description);

    if (balance != null) prevBalance = balance;
    else if (prevBalance != null && direction) prevBalance = round2(prevBalance + direction * a1.value);

    txns.push({ ...date, description, amount: a1.value, direction, balance, page });
  }

  const months = new Map();
  const credits = [];
  let totalCredits = 0;
  let totalDebits = 0;
  let unclassified = 0;
  let overdraftCount = 0;

  for (const t of txns) {
    if (!months.has(t.monthKey)) months.set(t.monthKey, true);
    if (t.direction === 1) {
      totalCredits += t.amount;
      credits.push({ date: t.iso || t.monthKey, description: t.description.slice(0, 80), amount: t.amount, page: t.page });
    } else if (t.direction === -1) {
      totalDebits += t.amount;
    } else {
      unclassified += 1;
    }
    if (t.direction !== 1 && OVERDRAFT_WORDS.test(t.description)) overdraftCount += 1;
  }

  const lastBalanceSeen = [...txns].reverse().find((t) => t.balance != null)?.balance ?? null;
  const payrollLike = credits.filter((c) => PAYROLL_WORDS.test(c.description));
  const monthsCovered = months.size;

  return {
    method: 'text-layer',
    pagesTotal: pagesTotal ?? pages.length,
    pagesScanned: pages.length,
    transactionsFound: txns.length,
    unclassified,
    unparsedDatedLines,
    monthsCovered,
    totalCredits: round2(totalCredits),
    totalDebits: round2(totalDebits),
    avgMonthlyCredits: monthsCovered ? round2(totalCredits / monthsCovered) : null,
    endingBalance: endingBalanceLabelled ?? lastBalanceSeen,
    overdraftCount,
    payrollLikeDeposits: payrollLike.slice(0, MAX_PAYROLL_LIST),
    credits: credits.slice(0, MAX_STORED_CREDITS),
    creditsTruncated: credits.length > MAX_STORED_CREDITS,
  };
}

// The stored deposit list is for server-side checks; API responses omit it.
export function withoutCredits(doc) {
  if (!doc?.statementSummary?.credits) return doc;
  const { credits, ...rest } = doc.statementSummary;
  return { ...doc, statementSummary: { ...rest, creditsStored: credits.length } };
}

// "BRIGHTLINE LOGISTICS PAYROLL" should match employer "Brightline Logistics,
// Inc." but a generic word like "Systems" alone must not.
const GENERIC_WORDS = new Set(['inc', 'llc', 'corp', 'co', 'company', 'ltd', 'the', 'and', 'group', 'systems', 'services', 'solutions', 'holdings']);
export function employerMatchesDescription(description, employer) {
  if (!description || !employer) return false;
  const desc = String(description).toLowerCase();
  const words = String(employer).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const distinctive = words.filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
  if (!distinctive.length) return desc.includes(words.join(' '));
  return desc.includes(words.join(' ')) || new RegExp(`\\b${distinctive[0]}`, 'i').test(desc);
}
