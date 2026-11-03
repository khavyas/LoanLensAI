import { readFile } from 'node:fs/promises';
import { RAG_CONFIG } from '../config/rag.js';
import { summarizeRetrieval } from './retrievalMetrics.js';

// Scores policy retrieval against golden questions. Shared by `npm run eval:retrieval` and the
// /admin/eval-retrieval endpoint, so it can be run on the deployed server, where the embedding
// and Chroma settings live.
//   set 'v1': the original 18 questions (data/eval/golden-policy-questions.json)
//   set 'v2': the 67 policy questions of the 125-question set (data/eval/golden-questions-v2.json)
//   mode 'dense' (vector search only) or 'hybrid' (vector + keyword + rerank)
const V1 = new URL('../../../data/eval/golden-policy-questions.json', import.meta.url);
const V2 = new URL('../../../data/eval/golden-questions-v2.json', import.meta.url);

export async function loadGolden(set = 'v1') {
  if (set === 'v2') {
    const all = JSON.parse(await readFile(V2, 'utf8'));
    return all.filter((c) => c.category === 'policy').map((c) => ({ question: c.question, expected: c.expect.sources }));
  }
  return JSON.parse(await readFile(V1, 'utf8'));
}

// opts: { mode, set } plus, for tests, { golden, embed(texts), retrieve(question, embedding) } or the
// older { search(embedding, n), select(result) } pair.
export async function runRetrievalEval(opts = {}) {
  const golden = opts.golden || (await loadGolden(opts.set));
  const embed = opts.embed || (async (texts) => (await import('./embeddingClient.js')).embedTexts(texts));
  let retrieve = opts.retrieve;
  if (!retrieve && opts.search) {
    const select = opts.select || ((await import('./ragOllama.js')).selectEvidence);
    retrieve = async (_question, embedding) => select(await opts.search(embedding, RAG_CONFIG.topK * 3));
  }
  if (!retrieve) {
    const { retrievePolicyEvidence } = await import('./hybridRetrieval.js');
    retrieve = (question, embedding) => retrievePolicyEvidence({ question, embedding, mode: opts.mode || 'dense' });
  }

  const cases = [];
  for (const item of golden) {
    const [vector] = await embed([item.question]);
    const ranked = (await retrieve(item.question, vector)).map((e) => e.sourceFile);
    cases.push({ question: item.question, expected: item.expected, ranked });
  }
  return {
    mode: opts.mode || 'dense',
    set: opts.set || 'v1',
    ...summarizeRetrieval(cases, RAG_CONFIG.topK),
    details: cases.map((c) => ({ question: c.question, expected: c.expected, found: c.ranked })),
  };
}

// The same questions under both modes, so the gain (or loss) from hybrid search is a measured number.
export async function runRetrievalComparison(opts = {}) {
  const golden = opts.golden || (await loadGolden(opts.set || 'v2'));
  const embed = opts.embed || (async (texts) => (await import('./embeddingClient.js')).embedTexts(texts));
  const memo = new Map();
  const cachedEmbed = async ([q]) => {
    if (!memo.has(q)) memo.set(q, (await embed([q]))[0]);
    return [memo.get(q)];
  };
  const run = (mode) => runRetrievalEval({ ...opts, golden, embed: cachedEmbed, mode, set: opts.set || 'v2', retrieve: opts.retrieveFor?.(mode) });
  const dense = await run('dense');
  const hybrid = await run('hybrid');
  const hit = (r) => new Set(r.details.filter((d) => d.found.some((f) => d.expected.includes(f))).map((d) => d.question));
  const denseHits = hit(dense);
  const hybridHits = hit(hybrid);
  const strip = ({ details: _d, ...rest }) => rest;
  return {
    set: opts.set || 'v2',
    dense: strip(dense),
    hybrid: strip(hybrid),
    delta: {
      recallAtK: hybrid.recallAtK - dense.recallAtK,
      precisionAtK: hybrid.precisionAtK - dense.precisionAtK,
      mrr: hybrid.mrr - dense.mrr,
    },
    fixedByHybrid: golden.map((g) => g.question).filter((q) => hybridHits.has(q) && !denseHits.has(q)),
    brokenByHybrid: golden.map((g) => g.question).filter((q) => denseHits.has(q) && !hybridHits.has(q)),
  };
}

// The quality gate: which floors a run misses. Used by `npm run eval:retrieval` (exit code) so a
// pull request that lowers retrieval quality cannot merge. Floors come from the governance targets.
export function checkFloors(summary, floors = {}) {
  const failures = [];
  const minRecall = floors.minRecall ?? 0.8;
  const minMrr = floors.minMrr ?? 0.6;
  if (!(summary.recallAtK >= minRecall)) failures.push(`recall@${summary.k} ${Number(summary.recallAtK).toFixed(2)} is below ${minRecall}`);
  if (!(summary.mrr >= minMrr)) failures.push(`MRR ${Number(summary.mrr).toFixed(2)} is below ${minMrr}`);
  return failures;
}
