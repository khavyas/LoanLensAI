// Who is a staff chat question about? "what is priya's loan status" must be
// answered about Priya's application, not about whichever application happens
// to be open. Pure (no imports) so it can be unit-tested from the backend suite.
//
// Staff can see every application, so names are matched against the full
// applications list: any whole-word match on a first or last name counts, in
// any letter case, with or without a possessive ("priya's").

// Words that can precede "'s <loan word>" without being a person's name.
const GENERIC = new Set([
  'my', 'this', 'the', 'our', 'your', 'his', 'her', 'their', 'that', 'its', 'an', 'a',
  'what', 'who', 'where', 'how', 'there', 'here', 'it', 'he', 'she',
  'loan', 'application', 'applicant', 'borrower', 'file', 'account', 'bank', 'status', 'document', 'documents',
]);

const words = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const nameParts = (name) => words(name).filter((w) => w.length >= 3);

// Returns:
//   { kind: 'none' }                    nobody else is named — answer for the open application
//   { kind: 'other', application }      exactly one other applicant, with one application
//   { kind: 'defer' }                   ambiguous, several people, or a name we do not know —
//                                       let the server answer (it enforces access and says why)
export function resolveNamedApplicant(question, currentApplication, applications = []) {
  const q = new Set(words(question));

  const mentioned = new Map(); // normalized applicant name -> that applicant's applications
  for (const app of applications) {
    const parts = nameParts(app.applicantName);
    if (parts.some((p) => q.has(p))) {
      const key = words(app.applicantName).join(' ');
      mentioned.set(key, [...(mentioned.get(key) || []), app]);
    }
  }

  const currentKey = words(currentApplication?.applicantName).join(' ');
  const others = [...mentioned.keys()].filter((k) => k !== currentKey);

  if (others.length === 0) {
    // "ravi's loan status" where nobody called Ravi exists: do not quietly
    // answer about the open application instead.
    const possessive = /\b([a-z]+)['’]s\s+(loan|application|status|documents?|progress|file|checks?|verification)\b/i.exec(question);
    const word = possessive?.[1]?.toLowerCase();
    if (word && !GENERIC.has(word) && !nameParts(currentApplication?.applicantName).includes(word)) {
      return { kind: 'defer' };
    }
    return { kind: 'none' };
  }
  if (others.length > 1 || mentioned.has(currentKey)) return { kind: 'defer' };

  const theirs = mentioned.get(others[0]);
  return theirs.length === 1 ? { kind: 'other', application: theirs[0] } : { kind: 'defer' };
}
