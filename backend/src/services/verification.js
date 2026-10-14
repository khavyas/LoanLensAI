// Deterministic cross-verification rules — intentionally NOT an LLM,
// so every flag is explainable and auditable.

import { AFFORDABILITY, SMALL_BUSINESS_REVENUE_CAP_RATIO, maxAffordableAmount, maxAffordableBusinessAmount } from '../config/affordability.js';
import { employerMatchesDescription } from './statementAnalysis.js';

const INCOME_TOLERANCE = 0.05; // 5%

// Fixed federal payroll-tax rates (2024/2025), not brackets — unlike federal/
// state income tax, these are flat percentages of gross pay, which is exactly
// what makes them checkable without a full tax-bracket model. We don't model
// the Social Security wage base cap (~$168k/yr) since it's irrelevant at our
// seeded income levels.
const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const STATUTORY_TOLERANCE = 0.02; // 2% — allows for cent-level rounding only
const YTD_TOLERANCE = 0.15; // 15% — real YTD varies period to period (OT, raises, unpaid leave)

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
}

export function verifyDocument(application, extracted, options = {}) {
  const f = extracted.fields || {};
  const checks = [];

  // Targeted re-upload: the borrower was fixing one specific required item.
  // Catch a wrong-file upload immediately instead of leaving it for an
  // officer to notice — the whole point of a self-service fix is that it
  // actually needs to fix the right thing.
  if (options.expectedDocType && extracted.docType && extracted.docType !== 'unknown') {
    const match = extracted.docType === options.expectedDocType;
    checks.push({
      field: 'Document type',
      expected: options.expectedDocType,
      found: extracted.docType,
      status: match ? 'match' : 'mismatch',
      explanation: match
        ? 'Uploaded document matches the requested type.'
        : `This looks like a ${extracted.docType.replace(/-/g, ' ')}, but a ${options.expectedDocType.replace(/-/g, ' ')} was requested. Please upload the correct document.`,
    });
  }

  if (f.fullName != null) {
    const match = normalizeName(f.fullName) === normalizeName(application.applicantName);
    checks.push({
      field: 'Name',
      expected: application.applicantName,
      found: f.fullName,
      status: match ? 'match' : 'mismatch',
      explanation: match
        ? 'Name on document matches the application.'
        : 'Name on this document does not match the applicant name on the application.',
    });
  }

  if (f.grossMonthlyIncome != null && application.statedMonthlyIncome != null) {
    const stated = application.statedMonthlyIncome;
    const found = f.grossMonthlyIncome;
    const diff = Math.abs(stated - found) / stated;
    const ok = diff <= INCOME_TOLERANCE;
    checks.push({
      field: 'Monthly income',
      expected: `$${stated.toLocaleString('en-US')}`,
      found: `$${found.toLocaleString('en-US')}`,
      status: ok ? 'match' : 'mismatch',
      explanation: ok
        ? `Documented income is within ${INCOME_TOLERANCE * 100}% of the stated income.`
        : `Application states $${stated.toLocaleString('en-US')}/mo but this document shows $${found.toLocaleString('en-US')}/mo (${(diff * 100).toFixed(0)}% difference). Ask the borrower to confirm or provide additional proof of income.`,
    });
  }

  // Statutory math: Social Security (6.2%) and Medicare (1.45%) are FIXED
  // federal percentages of gross pay (not brackets, unlike income tax — we
  // deliberately don't attempt to re-derive federal/state income tax, which
  // is progressive and depends on filing status/allowances we don't have).
  // Someone editing gross pay on a pay stub almost always forgets to also
  // rescale these two lines to match — a cheap, hard-to-fake tell.
  // These two are a REVIEW signal, never a hard failure: an edited gross
  // figure produces exactly this pattern, but so do legitimate pre-tax
  // benefits (health premiums, FSA reduce the FICA base), FICA-exempt workers,
  // and the Social Security wage cap. A flag sends a human to the stub's
  // deductions list; it does not declare the document fake.
  if (f.grossPayPeriod != null && f.socialSecurityWithheld != null) {
    const expected = f.grossPayPeriod * SOCIAL_SECURITY_RATE;
    const diff = Math.abs(expected - f.socialSecurityWithheld) / expected;
    const ok = diff <= STATUTORY_TOLERANCE;

    // Both FICA lines are charged on the same base, so if Medicare agrees with
    // Social Security about that base, the stub is internally consistent and a
    // lower-than-gross base is most likely pre-tax benefits.
    let baseNote = '';
    if (!ok && f.medicareWithheld != null) {
      const ssBase = f.socialSecurityWithheld / SOCIAL_SECURITY_RATE;
      const medBase = f.medicareWithheld / MEDICARE_RATE;
      if (ssBase > 0 && Math.abs(ssBase - medBase) / ssBase <= STATUTORY_TOLERANCE) {
        baseNote = ` Both FICA lines agree on a taxable base of ~$${ssBase.toFixed(2)} (about $${(f.grossPayPeriod - ssBase).toFixed(2)} below gross), which is typical when pre-tax benefits are deducted.`;
      }
    }
    checks.push({
      field: 'Social Security withholding (6.2%)',
      expected: `~$${expected.toFixed(2)}`,
      found: `$${f.socialSecurityWithheld.toFixed(2)}`,
      status: ok ? 'match' : 'warning',
      explanation: ok
        ? 'Social Security withholding matches the statutory 6.2% rate for the gross pay shown.'
        : `Social Security withholding ($${f.socialSecurityWithheld.toFixed(2)}) differs from 6.2% of the gross pay shown (~$${expected.toFixed(2)}). This is often legitimate (pre-tax benefits lower the taxable base; some workers are exempt) but it is also what an edited gross-pay figure looks like — check the deductions list.${baseNote}`,
    });
  }

  if (f.grossPayPeriod != null && f.medicareWithheld != null) {
    const expected = f.grossPayPeriod * MEDICARE_RATE;
    const diff = Math.abs(expected - f.medicareWithheld) / expected;
    const ok = diff <= STATUTORY_TOLERANCE;
    checks.push({
      field: 'Medicare withholding (1.45%)',
      expected: `~$${expected.toFixed(2)}`,
      found: `$${f.medicareWithheld.toFixed(2)}`,
      status: ok ? 'match' : 'warning',
      explanation: ok
        ? 'Medicare withholding matches the statutory 1.45% rate for the gross pay shown.'
        : `Medicare withholding ($${f.medicareWithheld.toFixed(2)}) differs from 1.45% of the gross pay shown (~$${expected.toFixed(2)}). Pre-tax benefits can legitimately cause this; an edited gross-pay figure can too — check the deductions list.`,
    });
  }

  // Year-to-date consistency: YTD gross divided by the pay period number
  // should land close to this period's gross pay. A wider tolerance than
  // the statutory checks above — real YTD isn't perfectly flat across a
  // year (raises, unpaid leave, overtime), so this only catches a YTD
  // figure that's wildly out of step with the current period's pay, not
  // small legitimate variance.
  if (f.ytdGrossPay != null && f.payPeriodNumber != null && f.grossPayPeriod != null && f.payPeriodNumber > 0) {
    const impliedPeriodGross = f.ytdGrossPay / f.payPeriodNumber;
    const diff = Math.abs(impliedPeriodGross - f.grossPayPeriod) / impliedPeriodGross;
    const ok = diff <= YTD_TOLERANCE;
    checks.push({
      field: 'Year-to-date gross consistency',
      expected: `~$${impliedPeriodGross.toFixed(2)}/period (from YTD ÷ period ${f.payPeriodNumber})`,
      found: `$${f.grossPayPeriod.toFixed(2)} this period`,
      status: ok ? 'match' : 'warning',
      explanation: ok
        ? 'Year-to-date gross pay is consistent with this period\'s gross pay and the pay period number shown.'
        : `Year-to-date gross ($${f.ytdGrossPay.toLocaleString('en-US')}) implies an average of ~$${impliedPeriodGross.toFixed(2)}/period through period ${f.payPeriodNumber}, which doesn't line up with this period's gross pay of $${f.grossPayPeriod.toFixed(2)} (${(diff * 100).toFixed(0)}% difference). A recent hire, unpaid leave, a bonus or a raise can cause this legitimately; so can an edited current-period figure whose YTD total was left unchanged — confirm with the borrower.`,
    });
  }

  if (f.businessName != null && application.businessName) {
    const match = normalizeName(f.businessName) === normalizeName(application.businessName);
    checks.push({
      field: 'Business name',
      expected: application.businessName,
      found: f.businessName,
      status: match ? 'match' : 'mismatch',
      explanation: match
        ? 'Business name on document matches the application.'
        : 'Business/DBA name on this document does not exactly match the application. Confirm the legal entity name before closing — mismatched entity names are a common cause of stalled loan closings.',
    });
  }

  if (f.annualBusinessRevenue != null && application.statedAnnualBusinessRevenue != null) {
    const stated = application.statedAnnualBusinessRevenue;
    const found = f.annualBusinessRevenue;
    const diff = Math.abs(stated - found) / stated;
    const ok = diff <= INCOME_TOLERANCE;
    checks.push({
      field: 'Annual business revenue',
      expected: `$${stated.toLocaleString('en-US')}`,
      found: `$${found.toLocaleString('en-US')}`,
      status: ok ? 'match' : 'mismatch',
      explanation: ok
        ? `Documented revenue is within ${INCOME_TOLERANCE * 100}% of the stated revenue.`
        : `Application states $${stated.toLocaleString('en-US')}/yr but this document shows $${found.toLocaleString('en-US')}/yr (${(diff * 100).toFixed(0)}% difference). Ask the applicant to confirm or provide additional financial statements.`,
    });
  }

  if (application.requestedAmount != null && f.grossMonthlyIncome != null && AFFORDABILITY[application.productType]) {
    // Uses the borrower's actual chosen term (captured at application time),
    // not an assumed fixed term — the same figure applies-time validation
    // used, so a document-backed re-check never disagrees with the ceiling
    // the borrower was already shown.
    const maxAffordable = maxAffordableAmount(application.productType, f.grossMonthlyIncome, application.repaymentTermMonths);
    const requested = application.requestedAmount;
    const ok = requested <= maxAffordable;
    checks.push({
      field: 'Requested amount vs. affordability',
      expected: `Up to ~$${Math.round(maxAffordable).toLocaleString('en-US')} (estimated from documented income)`,
      found: `$${requested.toLocaleString('en-US')} requested`,
      status: ok ? 'match' : 'warning',
      explanation: ok
        ? 'Requested amount is within the estimated affordable range for the documented income.'
        : `Requested amount is about ${(requested / maxAffordable).toFixed(1)}x the estimated affordable maximum based on documented income. This is a rough estimate, not a credit decision — confirm this isn't a data-entry error and review full affordability (existing debts, credit profile) before underwriting.`,
    });
  }

  if (
    application.requestedAmount != null &&
    f.annualBusinessRevenue != null &&
    application.productType === 'small-business-loan'
  ) {
    const maxAffordable = maxAffordableBusinessAmount(f.annualBusinessRevenue);
    const requested = application.requestedAmount;
    const ok = requested <= maxAffordable;
    checks.push({
      field: 'Requested amount vs. affordability',
      expected: `Up to ~$${Math.round(maxAffordable).toLocaleString('en-US')} (estimated at ${SMALL_BUSINESS_REVENUE_CAP_RATIO * 100}% of documented annual revenue)`,
      found: `$${requested.toLocaleString('en-US')} requested`,
      status: ok ? 'match' : 'warning',
      explanation: ok
        ? 'Requested amount is within the estimated affordable range for the documented annual revenue.'
        : `Requested amount is about ${(requested / maxAffordable).toFixed(1)}x the estimated affordable maximum based on documented annual revenue. This is a rough estimate, not a credit decision — review full debt-service capacity (existing obligations, cash flow) before underwriting.`,
    });
  }

  if (f.employerName != null && application.employerName) {
    const match = normalizeName(f.employerName) === normalizeName(application.employerName);
    checks.push({
      field: 'Employer',
      expected: application.employerName,
      found: f.employerName,
      status: match ? 'match' : 'warning',
      explanation: match
        ? 'Employer matches the application.'
        : 'Employer differs from the application — may be a legitimate job change; confirm with borrower.',
    });
  }

  // Cheap sanity bound — a single ownership-disclosure document per
  // application (our current model) can't prove percentages sum to 100%
  // across multiple owners, only that this one figure is itself plausible.
  if (f.ownershipPercent != null) {
    const ok = f.ownershipPercent > 0 && f.ownershipPercent <= 100;
    checks.push({
      field: 'Ownership percentage',
      expected: '0–100%',
      found: `${f.ownershipPercent}%`,
      status: ok ? 'match' : 'mismatch',
      explanation: ok
        ? 'Ownership percentage is within a valid range.'
        : `Ownership percentage (${f.ownershipPercent}%) is out of a valid 0–100% range — likely an extraction or data-entry error. Escalate to an officer.`,
    });
  }

  if (f.ssnLast4 != null && application.ssnLast4) {
    const match = f.ssnLast4 === application.ssnLast4;
    checks.push({
      field: 'SSN (last 4)',
      expected: `***-**-${application.ssnLast4}`,
      found: `***-**-${f.ssnLast4}`,
      status: match ? 'match' : 'mismatch',
      explanation: match ? 'SSN matches.' : 'SSN on this document does not match the application. Escalate to an officer.',
    });
  }

  const hasMismatch = checks.some((c) => c.status === 'mismatch');
  const hasWarning = checks.some((c) => c.status === 'warning');
  const lowConfidence = (extracted.confidence ?? 0) < 0.7;

  let overall = 'pass';
  if (hasMismatch) overall = 'fail';
  else if (hasWarning || lowConfidence) overall = 'needs-review';

  if (lowConfidence) {
    checks.push({
      field: 'Document quality',
      expected: 'Legible document',
      found: `Extraction confidence ${(extracted.confidence * 100).toFixed(0)}%`,
      status: 'warning',
      explanation: 'Low extraction confidence — routed to human review instead of auto-accepting.',
    });
  }

  return { checks, overall };
}

// Only a 'current' document satisfies a requirement or counts as an open
// issue — a superseded one is history, not the state of the application.
export function currentDocuments(documents) {
  return (documents || []).filter((d) => (d.status || 'current') === 'current');
}

const DEPOSIT_TOLERANCE = 0.1; // 10% — looser than INCOME_TOLERANCE since a single pay period can vary (OT, PTO payout)

// verifyDocument() only ever sees ONE document's own extracted fields against
// the application — it has no visibility into other documents already on
// file. This runs separately, across the current pay-stub + bank-statement
// pair, to answer a question no single-document check can: is the income
// claimed on the pay stub actually backed by a real deposit, or just a
// claim? A pay stub is trivial to alter; a matching bank deposit is much
// harder to fake convincingly.
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Pay can legitimately land in several accounts (a payroll "split deposit": a
// fixed amount to savings, the rest to checking), or in a different bank than
// the one the statement is from. So a missing or smaller deposit is a prompt
// to ask for the other account - a 'warning' - never proof that the stub is
// fake. A match is the only conclusive outcome.
function depositVsNetPayCheck(application, payStub, bankStatement) {
  const field = 'Bank deposit vs. pay stub net pay';
  const net = payStub.extractedFields?.netPay;
  if (net == null) return [];
  const expected = `~${money(net)} (pay stub net pay)`;
  const employer = payStub.extractedFields?.employerName || application.employerName;
  const summary = bankStatement.statementSummary;
  const within = (amount) => Math.abs(amount - net) / net <= DEPOSIT_TOLERANCE;

  // Full-statement path: every page's transactions were read from the PDF text.
  if (summary?.credits?.length) {
    const pages = summary.pagesScanned;
    const byEmployer = summary.credits.filter((c) => employerMatchesDescription(c.description, employer));
    const candidates = byEmployer.length ? byEmployer : summary.payrollLikeDeposits || [];

    const direct = candidates.filter((c) => within(c.amount)).sort((a, b) => Math.abs(a.amount - net) - Math.abs(b.amount - net))[0];
    if (direct) {
      return [{
        field, expected, found: `${money(direct.amount)} on ${direct.date}`, status: 'match',
        explanation: `A ${money(direct.amount)} payroll deposit ("${direct.description}") appears on the statement and matches the pay stub's net pay — the stub is corroborated by a real deposit (searched ${pages} page${pages === 1 ? '' : 's'}).`,
      }];
    }

    const byDate = new Map();
    for (const c of candidates) byDate.set(c.date, [...(byDate.get(c.date) || []), c]);
    for (const [date, group] of byDate) {
      const total = group.reduce((s, c) => s + c.amount, 0);
      if (group.length > 1 && within(total)) {
        return [{
          field, expected, found: `${group.map((c) => money(c.amount)).join(' + ')} on ${date}`, status: 'match',
          explanation: `The pay stub's net pay was split across ${group.length} deposits on ${date} (${money(total)} in total) — a normal split direct deposit, and it matches the stub.`,
        }];
      }
    }

    if (candidates.length) {
      const sample = candidates.slice(0, 3).map((c) => money(c.amount)).join(', ');
      return [{
        field, expected, found: `${candidates.length} payroll-like deposit(s), e.g. ${sample}`, status: 'warning',
        explanation: `Payroll-like deposits were found across ${pages} page${pages === 1 ? '' : 's'}, but none match the stub's net pay of ${money(net)}. If pay is split across accounts, ask for the statement of the other account; otherwise confirm the stub with the borrower.`,
      }];
    }
    return [{
      field, expected, found: `no payroll deposit found in ${pages} page${pages === 1 ? '' : 's'} scanned`, status: 'warning',
      explanation: `No payroll deposit was found in the ${pages} page${pages === 1 ? '' : 's'} scanned, so this statement cannot corroborate the pay stub. Pay may go to a different account — ask for the statement of the account that receives it.`,
    }];
  }

  // Single-deposit path: only what the AI read from page 1 of an image/scanned file.
  const deposit = bankStatement.extractedFields?.recentDepositAmount;
  const info = bankStatement.pageInfo;
  const partial = info?.total > 1 && !(info.aiRead >= info.total);
  const partialNote = partial ? ` Only page ${info.aiRead || 1} of ${info.total} of this statement was read, so a payroll deposit on a later page would not be seen.` : '';
  if (deposit == null) {
    return [{
      field, expected, found: 'no payroll deposit identified', status: 'warning',
      explanation: `No payroll deposit could be identified on the part of the statement that was read, so it cannot corroborate the pay stub.${partialNote}`,
    }];
  }
  const ok = within(deposit);
  return [{
    field, expected, found: `${money(deposit)} (latest payroll-like deposit read)`, status: ok ? 'match' : 'warning',
    explanation: ok
      ? "The latest payroll-like deposit read is consistent with the pay stub's net pay — the stub is corroborated by a real deposit, not just a claim."
      : `The latest payroll-like deposit read (${money(deposit)}) does not match the stub's net pay (${money(net)}). A split direct deposit would show only part of net pay in one account — ask for the other account's statement, or confirm the stub.${partialNote}`,
  }];
}

export function crossDocumentChecks(application, documents) {
  const current = currentDocuments(documents);
  const payStub = current.find((d) => d.docType === 'pay-stub');
  const bankStatement = current.find((d) => d.docType === 'bank-statement');
  if (!payStub || !bankStatement) return [];

  const checks = depositVsNetPayCheck(application, payStub, bankStatement);

  // With a full-statement scan the employer is already part of the match
  // above; this separate source check only applies to the single-deposit path.
  const stubEmployer = payStub.extractedFields?.employerName;
  const depositSource = bankStatement.extractedFields?.recentDepositSource;
  if (!bankStatement.statementSummary?.credits?.length && stubEmployer && depositSource) {
    const match = employerMatchesDescription(depositSource, stubEmployer);
    checks.push({
      field: 'Bank deposit source vs. pay stub employer',
      expected: stubEmployer,
      found: depositSource,
      status: match ? 'match' : 'warning',
      explanation: match
        ? 'The bank deposit description matches the employer named on the pay stub.'
        : `The bank statement's deposit description ("${depositSource}") does not clearly match the employer named on the pay stub ("${stubEmployer}") — confirm this is genuinely the same employer.`,
    });
  }

  return checks;
}

// Merges cross-document checks into the bank statement's own checks for
// display and status purposes, without persisting to the database — every
// read path (application detail, RAG context, post-upload status decision)
// calls this on the same fetched documents so the finding never drifts out
// of sync with whatever is actually on file right now.
export function withCrossDocumentChecks(application, documents) {
  const crossChecks = crossDocumentChecks(application, documents);
  if (!crossChecks.length) return documents;
  const bankStatement = currentDocuments(documents).find((d) => d.docType === 'bank-statement');
  if (!bankStatement) return documents;

  return documents.map((d) => {
    if (d !== bankStatement) return d;
    const checks = [...(d.verification?.checks || []), ...crossChecks];
    const hasMismatch = checks.some((c) => c.status === 'mismatch');
    const hasWarning = checks.some((c) => c.status === 'warning');
    let overall = 'pass';
    if (hasMismatch) overall = 'fail';
    else if (hasWarning) overall = 'needs-review';
    return { ...d, verification: { checks, overall } };
  });
}

export function missingDocuments(application, documents) {
  const received = new Set(currentDocuments(documents).map((d) => d.docType));
  return (application.requiredDocTypes || []).filter((t) => !received.has(t));
}

// The single actionable list behind the "live exception" flow: everything a
// borrower or officer still needs to act on, in one shape the UI can render
// directly — a required doc never uploaded, or a current doc with an open
// flag. Resolving one (uploading the missing doc, or re-uploading a fix for
// a flagged one) removes it from this list on the next fetch.
export function openExceptions(application, documents) {
  const current = currentDocuments(documents);
  const exceptions = missingDocuments(application, documents).map((docType) => ({
    type: 'missing',
    docType,
    documentId: null,
    message: `${docType.replace(/-/g, ' ')} has not been uploaded yet.`,
  }));

  for (const doc of current) {
    const flagged = (doc.verification?.checks || []).filter(
      (c) => c.status === 'mismatch' || c.status === 'warning'
    );
    if (flagged.length) {
      exceptions.push({
        type: 'flagged',
        docType: doc.docType,
        documentId: doc._id,
        message: flagged.map((c) => c.explanation).join(' '),
        checks: flagged,
      });
    }
  }

  return exceptions;
}
