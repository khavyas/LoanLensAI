import { RAG_CONFIG } from '../config/rag.js';
import { buildBm25Index, tokenize } from './bm25.js';

// Hybrid retrieval for policy questions (RAG plan P4-07):
//   1. dense  : nearest policy sections by meaning (Chroma), top 20
//   2. keyword: BM25 over the same sections (exact terms, numbers, form names), top 20
//   3. fuse   : reciprocal rank fusion, so a section ranked well by either list rises
//   4. rerank : small boosts for sections whose heading covers the question and for exact numbers
//   5. keep the best few, subject to a relevance gate (so an out-of-scope question still finds nothing)

export const RRF_K = 60;

// Reciprocal rank fusion: each list contributes 1 / (k + rank). Needs no score calibration between the lists.
export function fuse(lists, k = RRF_K) {
  const score = new Map();
  for (const list of lists) list.forEach((id, i) => score.set(id, (score.get(id) || 0) + 1 / (k + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ id, rrf: s }));
}

const NUMBER_TOKEN = /\d/;

// Boosts are small next to a first-place RRF score (about 0.016), so they re-order near ties
// without overriding a strong result from either search.
export function rerank(candidates, query, { headingBoost = 0.012, numberBoost = 0.008 } = {}) {
  const terms = [...new Set(tokenize(query))];
  const numbers = terms.filter((t) => NUMBER_TOKEN.test(t));
  return candidates
    .map((c) => {
      const heading = new Set(tokenize(`${c.sourceTitle || ''} ${c.section || ''}`));
      const body = new Set(tokenize(c.text));
      const headingCoverage = terms.length ? terms.filter((t) => heading.has(t)).length / terms.length : 0;
      const numberHits = numbers.filter((n) => body.has(n)).length;
      return { ...c, rerankScore: c.rrf + headingBoost * headingCoverage + numberBoost * Math.min(numberHits, 2) };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

// A chunk is allowed through if the vectors say it is close, or the keywords say it is a strong match
// (at least `minMatched` distinct query terms and a BM25 score of `minBm25`).
export function relevant(candidate, { maxDistance = RAG_CONFIG.maxDistance, minBm25 = 5, minMatched = 2 } = {}) {
  if (Number.isFinite(candidate.distance) && candidate.distance <= maxDistance) return true;
  return candidate.bm25 >= minBm25 && candidate.matched >= minMatched;
}

// Pure core: dense results (already flattened, with distance) + the full chunk list for the keyword side.
export function hybridSelect({ question, dense, chunks, topK = RAG_CONFIG.topK, candidates = 20, gate = {} }) {
  const index = buildBm25Index(chunks.map((c) => ({ id: c.id, text: c.text })));
  const keyword = index.search(question, candidates);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const denseById = new Map(dense.map((d) => [d.id, d]));
  const keywordById = new Map(keyword.map((k) => [k.id, k]));

  const fused = fuse([dense.map((d) => d.id), keyword.map((k) => k.id)]).map(({ id, rrf }) => {
    const base = byId.get(id) || denseById.get(id);
    return {
      ...base,
      id,
      rrf,
      distance: denseById.get(id)?.distance,
      bm25: keywordById.get(id)?.score ?? 0,
      matched: keywordById.get(id)?.matched ?? 0,
    };
  });

  const seen = new Set();
  return rerank(fused.filter((c) => relevant(c, gate)), question)
    .filter((c) => {
      const key = String(c.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, topK)
    .map((c) => ({
      id: c.id,
      text: c.text,
      sourceTitle: c.sourceTitle || c.sourceFile || 'Approved loan policy',
      sourceFile: c.sourceFile || 'unknown',
      section: c.section || 'General',
      distance: c.distance,
    }));
}

// ---- wiring to Chroma, with a short-lived cache of the policy chunks used for the keyword side ----

let cache = null;
export function invalidatePolicyCache() {
  cache = null;
}

async function loadChunks(signal) {
  const ttl = Number(process.env.RAG_BM25_TTL_MS || 300000);
  if (cache && Date.now() - cache.at < ttl) return cache.chunks;
  const chroma = await import('./chromaService.js');
  const collectionId = await chroma.getOrCreatePolicyCollection(signal);
  const result = await chroma.getCollectionDocuments(collectionId, { category: { $eq: 'loan-policy' } });
  const chunks = (result.ids || []).map((id, i) => ({ id, text: result.documents?.[i], ...(result.metadatas?.[i] || {}) })).filter((c) => typeof c.text === 'string');
  cache = { at: Date.now(), chunks };
  return chunks;
}

export const retrievalMode = () => (process.env.RAG_RETRIEVAL || 'dense').toLowerCase();

function flattenDense(result) {
  const ids = result.ids?.[0] || [];
  return ids.map((id, i) => ({ id, text: result.documents?.[0]?.[i], ...(result.metadatas?.[0]?.[i] || {}), distance: result.distances?.[0]?.[i] }));
}

// Policy evidence for a question. mode 'dense' is the original behaviour; 'hybrid' adds keyword search and rerank.
// deps lets tests (and the evaluation) supply the searches.
export async function retrievePolicyEvidence({ question, embedding, signal, mode = retrievalMode(), deps = {} }) {
  const chroma = deps.denseSearch ? null : await import('./chromaService.js');
  const denseSearch = deps.denseSearch || (async (n) => {
    const collectionId = await chroma.getOrCreatePolicyCollection(signal);
    return chroma.queryPolicyRecords(collectionId, embedding, n, undefined, signal);
  });
  const dense = flattenDense(await denseSearch(20));

  if (mode === 'hybrid') {
    try {
      const chunks = deps.chunks || (await loadChunks(signal));
      if (chunks.length) return hybridSelect({ question, dense, chunks });
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      console.error('[hybridRetrieval] keyword side unavailable, using vector search only:', error.message);
    }
  }
  return denseOnly(dense);
}

// The original selection: distance cutoff, duplicate removal, top K.
export function denseOnly(dense, topK = RAG_CONFIG.topK) {
  const seen = new Set();
  return dense
    .filter((c) => typeof c.text === 'string' && Number.isFinite(c.distance) && c.distance <= RAG_CONFIG.maxDistance)
    .filter((c) => {
      const key = c.text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, topK)
    .map((c) => ({
      id: c.id,
      text: c.text,
      sourceTitle: c.sourceTitle || c.sourceFile || 'Approved loan policy',
      sourceFile: c.sourceFile || 'unknown',
      section: c.section || 'General',
      distance: c.distance,
    }));
}
