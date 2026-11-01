// Scores policy retrieval against the golden questions in data/eval/golden-policy-questions.json.
// Needs the same env as the chat (embedding provider + Chroma) and an ingested policy collection:
//   npm run eval:retrieval
// Prints recall@k, precision@k and MRR so a chunking, model or index change can be compared with
// the previous run. Exits 1 if recall falls under EVAL_MIN_RECALL (default 0.8), so CI can gate on it.
// The same evaluation is available on a deployed server at /admin/eval-retrieval.
import 'dotenv/config';
import { runRetrievalEval } from '../services/retrievalEval.js';

const { details: _details, ...summary } = await runRetrievalEval();
console.log(JSON.stringify(summary, null, 2));
const floor = Number(process.env.EVAL_MIN_RECALL || 0.8);
if (summary.recallAtK < floor) {
  console.error(`recall@${summary.k} ${summary.recallAtK.toFixed(2)} is below ${floor}`);
  process.exit(1);
}
