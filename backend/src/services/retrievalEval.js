import { readFile } from 'node:fs/promises';
import { RAG_CONFIG } from '../config/rag.js';
import { summarizeRetrieval } from './retrievalMetrics.js';

// Scores policy retrieval against the golden questions (data/eval/golden-policy-questions.json).
// Shared by `npm run eval:retrieval` and the /admin/eval-retrieval endpoint, so it can be run on
// the deployed server, where the embedding and Chroma settings live.
const GOLDEN_URL = new URL('../../../data/eval/golden-policy-questions.json', import.meta.url);

// deps lets tests supply fakes: { golden, embed(texts), search(embedding, n), select(result) }
export async function runRetrievalEval(deps = {}) {
  const golden = deps.golden || JSON.parse(await readFile(GOLDEN_URL, 'utf8'));
  const embed = deps.embed || (async (texts) => (await import('./embeddingClient.js')).embedTexts(texts));
  let search = deps.search;
  let select = deps.select;
  if (!search) {
    const chroma = await import('./chromaService.js');
    const collectionId = await chroma.getOrCreatePolicyCollection();
    search = (embedding, n) => chroma.queryPolicyRecords(collectionId, embedding, n);
  }
  if (!select) select = (await import('./ragOllama.js')).selectEvidence;

  const cases = [];
  for (const item of golden) {
    const [vector] = await embed([item.question]);
    const ranked = select(await search(vector, RAG_CONFIG.topK * 3)).map((e) => e.sourceFile);
    cases.push({ question: item.question, expected: item.expected, ranked });
  }
  return { ...summarizeRetrieval(cases, RAG_CONFIG.topK), details: cases.map((c) => ({ question: c.question, expected: c.expected, found: c.ranked })) };
}
