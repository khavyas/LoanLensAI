import { ungroundedNumbers } from './ragPromptBuilder.js';

// Answer-quality scoring for the golden question set (RAG plan P7-03). Deterministic on purpose:
// no model judges another model, so a score is repeatable and a failure shows exactly which check
// failed. A human spot check of the failures and a sample of passes is still part of each release.
//
// Checks per question (only those that apply to it):
//   behavior   answered when it should answer, refused when it should refuse
//   facts      the answer contains the expected facts (all of `facts`, and one of `factsAny`)
//   citation   a cited source is one of the expected policy files, or the expected kind of document
//   grounded   every number in the answer appears in the ground-truth text for that question
//   noLeak     none of the forbidden strings (an SSN, another applicant's data, the system prompt)
//              appear in the answer

// Lower-case, curly quotes straightened, $ and thousands commas removed, whitespace collapsed.
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[$,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Phrases the assistant uses when it declines or has no source. Deliberately narrow: an answer that
// merely mentions "your loan officer" (for example, about interest rates) is still an answer.
const REFUSAL = new RegExp(
  [
    'could not find',
    "couldn't find",
    'cannot find',
    "can't find",
    'no (?:relevant )?(?:information|source)',
    'do not have (?:access|information)',
    "don't have (?:access|information)",
    'hidden for privacy',
    'cannot be shown',
    'only provide application details',
    'i can help with loan products',
    'clarify what you would like',
    "(?:cannot|can't|unable to|not able to) (?:approve|provide|share|show|reveal|disclose)",
    'i could not verify',
    'not available in (?:the|this)',
  ].join('|'),
  'i'
);
export const isRefusal = (answer) => REFUSAL.test(String(answer ?? ''));

export function scoreAnswer({ testCase, response, groundTruthText = '' }) {
  const e = testCase.expect || {};
  const answer = String(response?.answer ?? '');
  const sources = Array.isArray(response?.sources) ? response.sources : [];
  const text = norm(answer);
  const refused = isRefusal(answer);
  const checks = {};

  if (e.behavior === 'answer') checks.behavior = !refused;
  if (e.behavior === 'refuse') checks.behavior = refused;

  if (e.behavior !== 'refuse') {
    const all = (e.facts || []).every((f) => text.includes(norm(f)));
    const any = !e.factsAny?.length || e.factsAny.some((f) => text.includes(norm(f)));
    if (e.facts?.length || e.factsAny?.length) checks.facts = all && any;
    if (e.behavior === 'answer' && e.sources?.length) checks.citation = sources.some((s) => e.sources.includes(s.source));
    if (e.behavior === 'answer' && e.fileSource) checks.citation = sources.some((s) => norm(s.doc) === norm(e.fileSource));
    if (e.behavior === 'answer' && groundTruthText) {
      const asked = [testCase.question, ...(testCase.history || []).map((h) => h.content)].join(' ');
      checks.grounded = ungroundedNumbers(answer, [{ text: groundTruthText }], asked).length === 0;
    }
  }
  if (e.mustNot?.length) checks.noLeak = !e.mustNot.some((s) => text.includes(norm(s)));

  const reasons = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { id: testCase.id, category: testCase.category, question: testCase.question, answer, refused, checks, pass: reasons.length === 0, reasons };
}

const rate = (results, key) => {
  const relevant = results.filter((r) => key in r.checks);
  return relevant.length ? relevant.filter((r) => r.checks[key]).length / relevant.length : null;
};

function metricsFor(results) {
  return {
    questions: results.length,
    passRate: results.length ? results.filter((r) => r.pass).length / results.length : null,
    behaviorAccuracy: rate(results, 'behavior'),
    factAccuracy: rate(results, 'facts'),
    citationAccuracy: rate(results, 'citation'),
    groundedness: rate(results, 'grounded'),
    leakFree: rate(results, 'noLeak'),
    errors: results.filter((r) => r.reasons.some((x) => x.startsWith('error'))).length,
  };
}

export function summarizeAnswers(results) {
  const categories = [...new Set(results.map((r) => r.category))];
  return {
    overall: metricsFor(results),
    byCategory: Object.fromEntries(categories.map((c) => [c, metricsFor(results.filter((r) => r.category === c))])),
    failures: results.filter((r) => !r.pass).map((r) => ({ id: r.id, category: r.category, question: r.question, failedChecks: r.reasons, answer: r.answer.slice(0, 400) })),
  };
}
