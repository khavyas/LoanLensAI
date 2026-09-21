// Deterministic cross-verification rules — intentionally NOT an LLM,
// so every flag is explainable and auditable.

const INCOME_TOLERANCE = 0.05; // 5%

// Simplified affordability heuristics — advisory triage only, NOT a real
// underwriting/credit decision. We deliberately avoid any interest-rate math
// (the assistant never quotes rates), so these estimate a rough maximum from
// documented income/revenue alone. maxPaymentRatio/maxTermMonths translate
// the ratio and term language already in the product policy docs into a
// single dollar ceiling; a loan officer always makes the real call.
const AFFORDABILITY = {
  'auto-loan': { maxPaymentRatio: 1 / 3, maxTermMonths: 72, productCap: 75000 },
  'personal-loan': { maxPaymentRatio: 0.45, maxTermMonths: 36, productCap: 25000 },
};
const SMALL_BUSINESS_REVENUE_CAP_RATIO = 0.3; // rough rule of thumb, not a debt-service-coverage calc
const SMALL_BUSINESS_PRODUCT_CAP = 250000;

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
    const { maxPaymentRatio, maxTermMonths, productCap } = AFFORDABILITY[application.productType];
    const maxAffordable = Math.min(productCap, f.grossMonthlyIncome * maxPaymentRatio * maxTermMonths);
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
    const maxAffordable = Math.min(SMALL_BUSINESS_PRODUCT_CAP, f.annualBusinessRevenue * SMALL_BUSINESS_REVENUE_CAP_RATIO);
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
export function crossDocumentChecks(application, documents) {
  const current = currentDocuments(documents);
  const payStub = current.find((d) => d.docType === 'pay-stub');
  const bankStatement = current.find((d) => d.docType === 'bank-statement');
  if (!payStub || !bankStatement) return [];

  const checks = [];
  const netPay = payStub.extractedFields?.netPay;
  const depositAmount = bankStatement.extractedFields?.recentDepositAmount;
  if (netPay != null && depositAmount != null) {
    const diff = Math.abs(netPay - depositAmount) / netPay;
    const ok = diff <= DEPOSIT_TOLERANCE;
    checks.push({
      field: 'Bank deposit vs. pay stub net pay',
      expected: `~$${netPay.toLocaleString('en-US')} (pay stub net pay)`,
      found: `$${depositAmount.toLocaleString('en-US')} (most recent bank deposit)`,
      status: ok ? 'match' : 'mismatch',
      explanation: ok
        ? "The most recent bank deposit is consistent with the pay stub's net pay — the pay stub is corroborated by a real, matching deposit, not just a claim."
        : `The bank statement's most recent deposit ($${depositAmount.toLocaleString('en-US')}) does not match the pay stub's net pay ($${netPay.toLocaleString('en-US')}, ${(diff * 100).toFixed(0)}% difference). A pay stub not backed by a matching deposit is a document-authenticity red flag — escalate to a human reviewer rather than accepting the document at face value.`,
    });
  }

  const stubEmployer = payStub.extractedFields?.employerName;
  const depositSource = bankStatement.extractedFields?.recentDepositSource;
  if (stubEmployer && depositSource) {
    const match = depositSource.toLowerCase().includes(stubEmployer.toLowerCase());
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
