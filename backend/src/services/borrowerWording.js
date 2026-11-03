// Verification explanations are written for the loan officer ("ask the borrower to confirm",
// "escalate to an officer"). A borrower must see the same finding in words addressed to them.
// Explanations that already speak to the applicant (an expired ID: "please upload a current ID")
// are kept exactly as they are; only staff-directed ones are rewritten.

const STAFF_WORDS = /\b(?:officer|borrower|escalate|ask the|confirm with|analyst|reviewer)\b/i;

const REWRITE = {
  'Date of birth': () => 'The date of birth on this document does not match your application. Please contact your loan officer.',
  Address: () => 'The address on this document differs from the address on your application. If you have moved, upload proof of your current address, or correct the address on your application.',
  'Monthly income': (c) => `Your application states ${c.expected || 'one income figure'} per month, but this document shows ${c.found || 'a different figure'}. If the figure on your application is wrong, correct it with Edit application; otherwise upload a document that shows the right amount.`,
  'Year-to-date gross consistency': () => 'The year-to-date total on this pay stub does not line up with its current pay period. A recent hire, unpaid leave, a bonus or a raise can cause this; otherwise please upload your most recent pay stub.',
  Employer: () => 'The employer on this document differs from the employer on your application. If your employer has changed, update it with Edit application; otherwise upload the right document.',
  'Ownership percentage': () => 'The ownership percentage looks out of range. Please check it and contact your loan officer.',
  'SSN (last 4)': () => 'The SSN on this document does not match your application. Please contact your loan officer.',
  'Bank deposit source vs. pay stub employer': () => 'The payroll deposits on your bank statement do not match your pay stub. If your pay is split across accounts, upload the statement for the other account.',
};
const GENERIC = 'This item needs another look. Please contact your loan officer.';

export function borrowerExplanation(check) {
  const text = String(check?.explanation || '');
  if (!STAFF_WORDS.test(text)) return text;
  return (REWRITE[check.field] || (() => GENERIC))(check);
}

const rewriteChecks = (checks = []) => checks.map((c) => ({ ...c, explanation: borrowerExplanation(c) }));

// The application as a borrower may see it: every document check and open exception in borrower wording.
export function borrowerView(app) {
  if (!app) return app;
  const out = { ...app };
  if (Array.isArray(app.documents)) {
    out.documents = app.documents.map((d) => (d.verification?.checks ? { ...d, verification: { ...d.verification, checks: rewriteChecks(d.verification.checks) } } : d));
  }
  if (Array.isArray(app.openExceptions)) {
    out.openExceptions = app.openExceptions.map((e) => {
      if (e.type !== 'flagged') return e;
      const checks = rewriteChecks(e.checks);
      return { ...e, checks, message: checks.map((c) => c.explanation).join(' ') };
    });
  }
  return out;
}

// One uploaded document, in borrower wording (the upload response).
export function borrowerDocument(doc) {
  return borrowerView({ documents: [doc] }).documents[0];
}
