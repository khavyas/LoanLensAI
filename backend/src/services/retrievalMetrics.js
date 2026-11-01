// Retrieval quality metrics for the policy search. For each golden question we know which
// policy file(s) should answer it; `ranked` is the list of source files retrieval returned, best first.
const hitRanks = (ranked, expected) => ranked.map((f, i) => (expected.includes(f) ? i + 1 : null)).filter(Boolean);

// 1 if any expected source appears in the top k, else 0.
export const recallAtK = (ranked, expected, k) => (hitRanks(ranked.slice(0, k), expected).length ? 1 : 0);

// Share of the top k results that come from an expected source.
export function precisionAtK(ranked, expected, k) {
  const top = ranked.slice(0, k);
  return top.length ? top.filter((f) => expected.includes(f)).length / top.length : 0;
}

// 1 / rank of the first expected source (0 when none was retrieved).
export const reciprocalRank = (ranked, expected) => {
  const [first] = hitRanks(ranked, expected);
  return first ? 1 / first : 0;
};

// cases: [{ question, expected: [files], ranked: [files] }] -> averages, plus the misses.
export function summarizeRetrieval(cases, k = 5) {
  const scored = cases.filter((c) => c.expected?.length);
  const mean = (fn) => (scored.length ? scored.reduce((sum, c) => sum + fn(c), 0) / scored.length : 0);
  return {
    questions: scored.length,
    k,
    recallAtK: mean((c) => recallAtK(c.ranked, c.expected, k)),
    precisionAtK: mean((c) => precisionAtK(c.ranked, c.expected, k)),
    mrr: mean((c) => reciprocalRank(c.ranked, c.expected)),
    misses: scored.filter((c) => !recallAtK(c.ranked, c.expected, k)).map((c) => c.question),
  };
}
