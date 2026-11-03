import { currentDocuments } from './verification.js';

// "What does my driver license say?" when no driver license is on file. Searching would only find
// loosely related text, so the answer is exact and comes from the list of documents on file.
const TYPES = [
  { type: 'drivers-license', label: "driver's license", pattern: /\bdriver'?s?[\s-]*licen[cs]e\b/i },
  { type: 'pay-stub', label: 'pay stub', pattern: /\bpay[\s-]*stubs?\b/i },
  { type: 'bank-statement', label: 'bank statement', pattern: /\bbank[\s-]*statements?\b/i },
];
// The question is about what is IN the document, not about the policy for it.
const CONTENT = /\b(say|says|show|shows|contain|contains|read|reads|expir\w*|number|date|name|employer|income|pay|deposit|balance|value|details|information)\b/i;
const POSSESSIVE = /\b(my|this|the|their|applicant'?s?|borrower'?s?)\b/i;

export function missingDocumentAnswer(question, documents, role) {
  const q = String(question || '');
  if (!CONTENT.test(q) || !POSSESSIVE.test(q)) return null;
  const hit = TYPES.find((t) => t.pattern.test(q));
  if (!hit) return null;
  if (currentDocuments(documents || []).some((d) => d.docType === hit.type)) return null;
  const answer = role === 'borrower'
    ? `I cannot find a ${hit.label} in your file. It has not been uploaded yet (or it was removed). Please upload it from the Documents tab and I can read it.`
    : `There is no ${hit.label} on this application. It has not been uploaded yet, or it was removed.`;
  return { answer, sources: [{ doc: 'Application documents' }] };
}
