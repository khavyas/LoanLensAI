// Underwriting policy knobs for the exception workflow.
//
// DEMO DEFAULTS: the minimum credit scores below are placeholders so the
// exception flow can be shown end to end. No policy document states them yet
// (see docs/POLICY_COVERAGE_AND_QUESTIONS.md, "Credit Checks & Credit Score
// Policy") — replace with the bank's real cut-offs before any pilot.
export const MIN_CREDIT_SCORE = {
  'auto-loan': 620,
  'personal-loan': 660,
  'small-business-loan': 680,
};

export const CREDIT_SCORE_RANGE = { min: 300, max: 850 };

// Parameters an underwriter MAY waive, with a documented reason. Everything
// else is a compliance / fraud guardrail and can only be fixed, never waived:
// an exception is for "the numbers are short but the borrower is sound", not
// for "the documents disagree about who the borrower is".
export const WAIVABLE_PARAMETERS = ['credit-score', 'affordability'];

// Minimum length for free-text justifications, so "ok" is not an exception reason.
export const MIN_JUSTIFICATION_CHARS = 20;
