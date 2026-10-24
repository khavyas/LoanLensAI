// Residency status: a field the applicant declares, and the policy rule the
// bank applies to it (data/policies/residency-and-identity-policy.md).
//
// US lenders do not verify citizenship against a government site; they verify
// WHO the applicant is (identity checks) and apply product policy to
// residency. Fair-lending law forbids discrimination on national origin, so
// the only residency question the rule asks is a practical one: will the
// applicant's legal status last as long as the loan?

export const RESIDENCY_OPTIONS = [
  { value: 'us-citizen', label: 'U.S. citizen' },
  { value: 'permanent-resident', label: 'Permanent resident (green card)' },
  { value: 'visa-holder', label: 'Visa holder (temporary status)' },
];

const VALUES = RESIDENCY_OPTIONS.map((o) => o.value);

// Used when a product has no repayment term (small-business loans).
export const DEFAULT_TERM_MONTHS = 60;

const day = (d) => new Date(d).toISOString().slice(0, 10);

export function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// Intake validation. A visa holder must say how long the visa is valid, since
// the rule below needs it.
export function validateResidency({ residencyStatus, visaValidUntil } = {}, now = new Date()) {
  if (!VALUES.includes(residencyStatus)) {
    return { error: 400, message: `residencyStatus must be one of: ${VALUES.join(', ')}` };
  }
  if (residencyStatus !== 'visa-holder') return { residencyStatus };
  const until = new Date(visaValidUntil);
  if (!visaValidUntil || Number.isNaN(until.getTime())) {
    return { error: 400, message: 'visaValidUntil (the date your visa expires) is required for a visa holder' };
  }
  if (until <= now) {
    return { error: 400, message: 'Your visa has already expired. A valid status is required to apply.' };
  }
  return { residencyStatus, visaValidUntil: until };
}

// The decision parameter. Citizens and permanent residents meet it. A visa
// holder meets it only if the visa outlasts the loan term; otherwise it is a
// shortfall an underwriter may waive, with a condition (for example "the
// borrower provides proof of renewal"). Missing data is pending, never met.
export function residencyParameter(application, now = new Date()) {
  const base = { key: 'residency', label: 'Residency status covers the loan term', waivable: true };
  const status = application.residencyStatus;
  if (status === 'us-citizen') return { ...base, status: 'met', detail: 'U.S. citizen' };
  if (status === 'permanent-resident') return { ...base, status: 'met', detail: 'Permanent resident (green card)' };
  if (status !== 'visa-holder') {
    return { ...base, status: 'pending', detail: 'Residency status was not provided on the application' };
  }
  if (!application.visaValidUntil) {
    return { ...base, status: 'pending', detail: 'Visa holder, but no visa expiry date was provided' };
  }
  const term = application.repaymentTermMonths || DEFAULT_TERM_MONTHS;
  const termEnd = addMonths(now, term);
  const ok = new Date(application.visaValidUntil) >= termEnd;
  return {
    ...base,
    status: ok ? 'met' : 'unmet',
    detail: ok
      ? `Visa valid until ${day(application.visaValidUntil)}, beyond the end of the ${term}-month term (${day(termEnd)})`
      : `Visa valid until ${day(application.visaValidUntil)}, but the ${term}-month term runs to ${day(termEnd)}`,
  };
}
