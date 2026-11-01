// Scores policy retrieval against the golden questions in data/eval/golden-policy-questions.json.
// Needs the same env as the chat (embedding provider + Chroma) and an ingested policy collection:
//   npm run eval:retrieval
// Prints recall@k, precision@k and MRR so a chunking, model or index change can be compared with
// the previous run. Exits 1 if recall falls under EVAL_MIN_RECALL (default 0.8), so CI can gate on it.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { RAG_CONFIG } from '../config/rag.js';
import { embedTexts } from '../services/embeddingClient.js';
import { getOrCreatePolicyCollection, queryPolicyRecords } from '../services/chromaService.js';
import { selectEvidence } from '../services/ragOllama.js';
import { summarizeRetrieval } from '../services/retrievalMetrics.js';

const golden = JSON.parse(await readFile(new URL('../../../data/eval/golden-policy-questions.json', import.meta.url), 'utf8'));
const collectionId = await getOrCreatePolicyCollection();
const cases = [];
for (const item of golden) {
  const [vector] = await embedTexts([item.question]);
  const result = await queryPolicyRecords(collectionId, vector, RAG_CONFIG.topK * 3);
  const ranked = selectEvidence(result).map((e) => e.sourceFile);
  cases.push({ question: item.question, expected: item.expected, ranked });
}
const summary = summarizeRetrieval(cases, RAG_CONFIG.topK);
console.log(JSON.stringify(summary, null, 2));
const floor = Number(process.env.EVAL_MIN_RECALL || 0.8);
if (summary.recallAtK < floor) {
  console.error(`recall@${summary.k} ${summary.recallAtK.toFixed(2)} is below ${floor}`);
  process.exit(1);
}
