// Single source of truth for which document types each loan product requires —
// previously duplicated between the seed script and the admin (no-shell)
// setup route; now also used when a borrower creates a new application.
export const REQUIRED_DOCS_BY_PRODUCT = {
  'auto-loan': ['pay-stub', 'drivers-license', 'bank-statement'],
  'personal-loan': ['pay-stub', 'drivers-license', 'bank-statement'],
  'small-business-loan': [
    'business-tax-return',
    'personal-financial-statement',
    'business-license',
    'ownership-disclosure',
  ],
};

export const PRODUCT_TYPES = Object.keys(REQUIRED_DOCS_BY_PRODUCT);
