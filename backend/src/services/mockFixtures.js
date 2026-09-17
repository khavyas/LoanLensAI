// Canned extraction results for the known seed document images, keyed by
// filename (case-insensitive, extension-agnostic). Used only when MOCK_AI=true
// — a bypass for testing everything downstream of extraction (verification,
// the live-exception flow, status transitions) without spending Anthropic
// API credits. Values mirror exactly what the real vision call would read
// off these specific synthetic images (see data/seed/generate_documents.py).
const FIXTURES = {
  'jordan-rivera-pay-stub': {
    docType: 'pay-stub',
    confidence: 0.95,
    fields: {
      fullName: 'Jordan Rivera',
      employerName: 'Brightline Logistics',
      grossMonthlyIncome: 4200,
      payPeriod: 'bi-weekly (07/28/2026 - 08/10/2026)',
      address: '412 Maple Court, Springfield',
      ssnLast4: null,
      documentDate: '08/14/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'jordan-rivera-drivers-license': {
    docType: 'drivers-license',
    confidence: 0.97,
    fields: {
      fullName: 'Jordan Rivera',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '412 Maple Court, Springfield',
      ssnLast4: null,
      documentDate: null,
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'jordan-rivera-bank-statement': {
    docType: 'bank-statement',
    confidence: 0.93,
    fields: {
      fullName: 'Jordan Rivera',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: null,
      ssnLast4: null,
      documentDate: '07/31/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'priya-nair-pay-stub': {
    docType: 'pay-stub',
    confidence: 0.95,
    fields: {
      fullName: 'Priya Nair',
      employerName: 'Cedar Health Systems',
      grossMonthlyIncome: 7200,
      payPeriod: 'bi-weekly (07/28/2026 - 08/10/2026)',
      address: '88 Lakeview Drive, Springfield',
      ssnLast4: null,
      documentDate: '08/14/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'priya-nair-drivers-license': {
    docType: 'drivers-license',
    confidence: 0.97,
    fields: {
      fullName: 'Priya Nair',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '88 Lakeview Drive, Springfield',
      ssnLast4: null,
      documentDate: null,
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'priya-nair-bank-statement': {
    docType: 'bank-statement',
    confidence: 0.93,
    fields: {
      fullName: 'Priya Nair',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: null,
      ssnLast4: null,
      documentDate: '07/31/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  // Planted exception: employer differs from the application's stated
  // employer ("Ironwood Manufacturing") — income matches exactly, isolating
  // the warning-tier "Employer differs" check (no other seeded scenario
  // exercises this softer check, only the harder 'mismatch' checks).
  'arjun-mehta-pay-stub': {
    docType: 'pay-stub',
    confidence: 0.95,
    fields: {
      fullName: 'Arjun Mehta',
      employerName: 'Falcon Freight Co.',
      grossMonthlyIncome: 3900,
      payPeriod: 'bi-weekly (07/28/2026 - 08/10/2026)',
      address: '17 Birch Street, Springfield',
      ssnLast4: null,
      documentDate: '08/14/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'arjun-mehta-drivers-license': {
    docType: 'drivers-license',
    confidence: 0.97,
    fields: {
      fullName: 'Arjun Mehta',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '17 Birch Street, Springfield',
      ssnLast4: null,
      documentDate: null,
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'arjun-mehta-bank-statement': {
    docType: 'bank-statement',
    confidence: 0.93,
    fields: {
      fullName: 'Arjun Mehta',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: null,
      ssnLast4: null,
      documentDate: '07/31/2026',
      businessName: null,
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'whitfield-bakery-business-tax-return': {
    docType: 'business-tax-return',
    confidence: 0.94,
    fields: {
      fullName: null,
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '220 Harborview Ave, Springfield',
      ssnLast4: null,
      documentDate: null,
      businessName: 'Whitfield & Co. Bakery LLC',
      ein: '84-1029384',
      annualBusinessRevenue: 275400,
      ownershipPercent: null,
    },
  },
  'whitfield-bakery-business-license': {
    docType: 'business-license',
    confidence: 0.96,
    fields: {
      fullName: null,
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '220 Harborview Ave, Springfield',
      ssnLast4: null,
      documentDate: null,
      // Planted entity-name mismatch — deliberately different from the
      // application's "Whitfield & Co. Bakery LLC".
      businessName: 'Whitfield And Co Bakery LLC',
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'whitfield-bakery-personal-financial-statement': {
    docType: 'personal-financial-statement',
    confidence: 0.92,
    fields: {
      fullName: 'Dana Whitfield',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: '14 Crestline Rd, Springfield',
      ssnLast4: '6672',
      documentDate: '06/30/2026',
      businessName: 'Whitfield & Co. Bakery LLC',
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: null,
    },
  },
  'whitfield-bakery-ownership-disclosure': {
    docType: 'ownership-disclosure',
    confidence: 0.9,
    fields: {
      fullName: 'Dana Whitfield',
      employerName: null,
      grossMonthlyIncome: null,
      payPeriod: null,
      address: null,
      ssnLast4: null,
      documentDate: null,
      businessName: 'Whitfield & Co. Bakery LLC',
      ein: null,
      annualBusinessRevenue: null,
      ownershipPercent: 100,
    },
  },
};

const UNKNOWN_FALLBACK = {
  docType: 'unknown',
  confidence: 0.3,
  fields: {
    fullName: null,
    employerName: null,
    grossMonthlyIncome: null,
    payPeriod: null,
    address: null,
    ssnLast4: null,
    documentDate: null,
    businessName: null,
    ein: null,
    annualBusinessRevenue: null,
    ownershipPercent: null,
  },
};

export function mockClassifyAndExtract(originalFilename) {
  const key = (originalFilename || '').toLowerCase().replace(/\.[^.]+$/, '');
  const fixture = FIXTURES[key];
  if (!fixture) {
    // Unrecognized filename in mock mode — return a low-confidence "unknown"
    // result rather than throwing, so the upload flow still completes and
    // routes to human review, same as a genuinely illegible real document.
    return { ...UNKNOWN_FALLBACK, fields: { ...UNKNOWN_FALLBACK.fields } };
  }
  return { docType: fixture.docType, confidence: fixture.confidence, fields: { ...fixture.fields } };
}
