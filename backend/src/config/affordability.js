// Single source of truth for loan-affordability heuristics — used both at
// application time (real-time ceiling on requestedAmount, before any
// document exists) and again post-document-upload in verification.js
// (re-checked against documented, not just self-reported, income). Keeping
// one definition means the two checks can never quietly drift apart.
//
// These are simplified advisory heuristics for a POC, not real underwriting
// (no credit score, no existing-debt/DTI data) — values are deliberately
// conservative to compensate for not knowing the applicant's other
// obligations:
// - Auto-loan: ~15% of gross monthly income as the payment ceiling tracks
//   common "affordable car payment" guidance (e.g. the 10-15% band cited by
//   NerdWallet/Credit Karma-style rules of thumb) — looser guidance (33%)
//   assumes no other debt at all, which we have no way to confirm.
// - Personal-loan: unsecured lenders (SoFi, Marcus, LightStream) generally
//   want *total* DTI including the new loan under ~35-40%. Since we don't
//   track existing debt, capping this one new payment at 20% of gross
//   income leaves headroom for obligations we can't see.
export const AFFORDABILITY = {
  'auto-loan': {
    maxPaymentRatio: 0.15,
    productCap: 75000,
    termOptions: [36, 48, 60, 72],
    defaultTerm: 60,
  },
  'personal-loan': {
    maxPaymentRatio: 0.2,
    productCap: 25000,
    termOptions: [24, 36, 48, 60],
    defaultTerm: 36,
  },
};

export const SMALL_BUSINESS_REVENUE_CAP_RATIO = 0.3; // rough rule of thumb, not a debt-service-coverage calc
export const SMALL_BUSINESS_PRODUCT_CAP = 250000;

// monthlyIncome * maxPaymentRatio approximates the payment a lender would
// consider affordable; multiplying by the term gives a rough loan-amount
// ceiling from that payment. Advisory only — a loan officer makes the real call.
export function maxAffordableAmount(productType, monthlyIncome, termMonths) {
  const cfg = AFFORDABILITY[productType];
  if (!cfg || monthlyIncome == null) return null;
  const term = termMonths || cfg.defaultTerm;
  return Math.min(cfg.productCap, monthlyIncome * cfg.maxPaymentRatio * term);
}

export function maxAffordableBusinessAmount(annualRevenue) {
  if (annualRevenue == null) return null;
  return Math.min(SMALL_BUSINESS_PRODUCT_CAP, annualRevenue * SMALL_BUSINESS_REVENUE_CAP_RATIO);
}
