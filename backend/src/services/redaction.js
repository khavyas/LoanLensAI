// Strips personal identifiers from text before it is embedded or sent to any model vendor
// (RAG plan P3-03, data rules in docs/RAG_GOVERNANCE.md). The raw SSN, account numbers, dates of
// birth, phone numbers and emails are replaced by a label, so retrieval can still say "an account
// number was present" without ever holding the number.

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|${MONTH}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${MONTH}\\s+\\d{4})`;

const RULES = [
  // Date of birth, whatever the label or format.
  [new RegExp(`\\b(dob|d\\.o\\.b\\.?|date of birth|birth ?date|born(?: on)?)(\\s*[:\\-]?\\s*)${DATE}`, 'gi'), '$1$2[DATE OF BIRTH]'],
  // SSN with separators, or labelled.
  [/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, '[SSN]'],
  [/\b(ssn|social security(?: number| no\.?)?)(\s*[:#\-]?\s*)[\dXx*\- ]{4,11}/gi, '$1$2[SSN]'],
  // Labelled account / routing / card numbers (keeps the label, drops the digits).
  [/\b(account|acct|a\/c|routing|aba|card|iban)(\s*(?:number|no\.?|num|#)?\s*[:#\-]?\s*)[\dXx*\- ]{6,}/gi, '$1$2[REDACTED NUMBER]'],
  // Card-like numbers: 13-19 digits in groups.
  [/\b(?:\d[ -]?){13,19}\b/g, '[REDACTED NUMBER]'],
  // Any other long unbroken digit run (8+ digits) is an identifier, not an amount.
  [/(?<![\d,.$])\d{8,}(?![\d,]*\.\d)/g, '[REDACTED NUMBER]'],
  [/\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g, '[PHONE]'],
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[EMAIL]'],
];

export function redactText(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

// A field (or check) whose NAME says it holds an identifier is blanked whatever the value looks like.
// Amounts such as socialSecurityWithheld are deliberately NOT matched: they are pay-stub figures.
const SENSITIVE_LABEL = /ssn|social ?security ?number|date ?of ?birth|^dob$|birth|license ?number|^ein$|account ?number|routing|card ?number|iban|passport|address/i;
export const isSensitiveLabel = (label) => SENSITIVE_LABEL.test(String(label || ''));

export function redactFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null) continue;
    if (isSensitiveLabel(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'object') {
      out[key] = redactText(JSON.stringify(value));
    } else {
      out[key] = redactText(String(value));
    }
  }
  return out;
}
