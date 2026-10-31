import { AFFORDABILITY, maxAffordableAmount, maxAffordableBusinessAmount } from '../config/affordability.js';
import { openExceptions, verifyDocument, withCrossDocumentChecks } from './verification.js';

// A borrower correcting a mistake on their own application (the FAQ promises this).
// Pure functions — the route only loads, saves and audits. Design:
//   * only while the application is still being checked (submitted / needs-review);
//     once it is with the underwriter or decided it is the record the decision rests on
//   * only non-identity facts. Name, SSN digits, date of birth, residency and product
//     are locked: changing an identity detail after documents exist is how someone
//     would manufacture a match, so those go through a loan officer
//   * the same intake rules as applying (affordability ceiling, term options)
//   * every change is recorded old -> new, and every document is re-verified

export const EDITABLE_STATUSES = ['submitted', 'needs-review'];

const COMMON = ['requestedAmount', 'address', 'loanReason'];
const CONSUMER_FIELDS = [...COMMON, 'statedMonthlyIncome', 'repaymentTermMonths', 'employerName', 'employerPhone'];
const BUSINESS_FIELDS = [...COMMON, 'businessName', 'statedAnnualBusinessRevenue'];

export const editableFields = (productType) => (productType === 'small-business-loan' ? BUSINESS_FIELDS : CONSUMER_FIELDS);

const IDENTITY_FIELDS = ['applicantName', 'applicantEmail', 'ssnLast4', 'dateOfBirth', 'residencyStatus', 'visaValidUntil', 'productType'];

const META = {
  requestedAmount: { label: 'Requested amount', kind: 'money' },
  statedMonthlyIncome: { label: 'Stated monthly income', kind: 'money' },
  statedAnnualBusinessRevenue: { label: 'Stated annual revenue', kind: 'money' },
  repaymentTermMonths: { label: 'Repayment term', kind: 'months' },
  employerName: { label: 'Employer name', kind: 'text' },
  employerPhone: { label: 'Employer phone', kind: 'text' },
  businessName: { label: 'Business name', kind: 'text' },
  address: { label: 'Address', kind: 'text' },
  loanReason: { label: 'Reason for loan', kind: 'text' },
};
const NUMERIC = new Set(['requestedAmount', 'statedMonthlyIncome', 'statedAnnualBusinessRevenue', 'repaymentTermMonths']);
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const fail = (error, message) => ({ error, message });

export function lockedMessage(status) {
  if (status === 'referred') return 'This application is with the underwriter, so it can no longer be edited.';
  if (status === 'approved' || status === 'rejected') return `This application is ${status}; it can no longer be edited.`;
  return 'This application can no longer be edited.';
}

// `changes` is the object the client sent; `application` the current plain record.
// Returns { error, message } or { updates, diff } where diff = [{ field, label, kind, from, to }].
export function validateEdit(application, changes) {
  if (!EDITABLE_STATUSES.includes(application.status)) return fail(409, lockedMessage(application.status));
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
    return fail(400, 'Send the fields you want to change.');
  }

  const allowed = editableFields(application.productType);
  const updates = {};
  for (const [field, raw] of Object.entries(changes)) {
    if (IDENTITY_FIELDS.includes(field)) {
      return fail(422, `${field === 'ssnLast4' ? 'SSN' : field === 'dateOfBirth' ? 'Date of birth' : 'This detail'} cannot be changed online. Contact your loan officer.`);
    }
    if (!allowed.includes(field)) return fail(400, `"${field}" cannot be edited on this application.`);

    if (NUMERIC.has(field)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return fail(422, `${META[field].label} must be a positive number.`);
      updates[field] = n;
    } else {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) return fail(422, `${META[field].label} cannot be empty.`);
      updates[field] = text;
    }
  }

  // Keep only what actually differs from the current record.
  for (const field of Object.keys(updates)) {
    if (updates[field] === application[field]) delete updates[field];
  }
  if (!Object.keys(updates).length) return fail(400, 'Nothing changed.');

  const merged = { ...application, ...updates };
  if (updates.repaymentTermMonths != null && !AFFORDABILITY[merged.productType]?.termOptions.includes(updates.repaymentTermMonths)) {
    return fail(422, `Repayment term must be one of: ${AFFORDABILITY[merged.productType].termOptions.join(', ')} months.`);
  }

  // The same affordability ceiling as applying. Changing income or term can lower it, so
  // it is checked against the merged values even if the amount itself was not edited.
  if (merged.productType === 'small-business-loan') {
    const max = maxAffordableBusinessAmount(merged.statedAnnualBusinessRevenue);
    if (merged.requestedAmount > max) {
      return fail(422, `Based on a stated annual revenue of ${usd(merged.statedAnnualBusinessRevenue)}, the maximum you can request is ~${usd(max)}. Lower the requested amount.`);
    }
  } else if (AFFORDABILITY[merged.productType]) {
    const max = maxAffordableAmount(merged.productType, merged.statedMonthlyIncome, merged.repaymentTermMonths);
    if (merged.requestedAmount > max) {
      return fail(422, `Based on a stated monthly income of ${usd(merged.statedMonthlyIncome)} and a ${merged.repaymentTermMonths}-month term, the maximum you can request is ~${usd(max)}. Lower the requested amount in the same edit, or choose a longer term.`);
    }
  }

  const diff = Object.keys(updates).map((field) => ({
    field,
    label: META[field].label,
    kind: META[field].kind,
    from: application[field] ?? null,
    to: updates[field],
  }));
  return { updates, diff };
}

// Re-run each CURRENT document's own checks against the corrected application. Uses the
// stored extraction (no new AI call) and the same expected type the original upload used.
export function reverifyDocuments(application, documents) {
  return documents
    .filter((d) => (d.status || 'current') === 'current')
    .map((d) => ({
      id: d._id,
      verification: verifyDocument(
        application,
        { docType: d.docType, fields: d.extractedFields || {}, confidence: d.confidence },
        { expectedDocType: d.expectedDocType || undefined }
      ),
    }));
}

// Same rule as a document upload: any open flag puts the file in the officer's queue; once
// every flag is cleared a "needs-review" file returns to "submitted" by itself.
export function statusAfterEdit(application, documents) {
  const flagged = openExceptions(application, withCrossDocumentChecks(application, documents)).some((e) => e.type === 'flagged');
  if (flagged) return 'needs-review';
  return application.status === 'needs-review' ? 'submitted' : application.status;
}

export function editSummary(diff) {
  return diff.map((c) => c.label).join(', ');
}
