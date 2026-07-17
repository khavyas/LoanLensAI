// Deterministic cross-verification rules — intentionally NOT an LLM,
// so every flag is explainable and auditable.

const INCOME_TOLERANCE = 0.05; // 5%

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
}

export function verifyDocument(application, extracted) {
  const f = extracted.fields || {};
  const checks = [];

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
      expected: `$${stated.toLocaleString()}`,
      found: `$${found.toLocaleString()}`,
      status: ok ? 'match' : 'mismatch',
      explanation: ok
        ? `Documented income is within ${INCOME_TOLERANCE * 100}% of the stated income.`
        : `Application states $${stated.toLocaleString()}/mo but this document shows $${found.toLocaleString()}/mo (${(diff * 100).toFixed(0)}% difference). Ask the borrower to confirm or provide additional proof of income.`,
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

export function missingDocuments(application, documents) {
  const received = new Set(documents.map((d) => d.docType));
  return (application.requiredDocTypes || []).filter((t) => !received.has(t));
}
