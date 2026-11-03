// Scores policy retrieval against the golden questions (data/eval).
// Needs the same env as the chat (embedding provider + Chroma) and an ingested policy collection:
//   npm run eval:retrieval
// Prints recall@k, precision@k and MRR so a chunking, model or index change can be compared with
// the previous run. Exits 1 if recall or MRR falls under its floor, so CI can gate on it:
//   EVAL_MIN_RECALL (default 0.8), EVAL_MIN_MRR (default 0.6), EVAL_SET (v1|v2), EVAL_MODE (dense|hybrid)
// The same evaluation is available on a deployed server at /admin/eval-retrieval.
import 'dotenv/config';
import { runRetrievalEval, checkFloors } from '../services/retrievalEval.js';

const { details: _details, ...summary } = await runRetrievalEval({
  set: process.env.EVAL_SET || 'v1',
  mode: process.env.EVAL_MODE || 'dense',
});
console.log(JSON.stringify(summary, null, 2));
const failures = checkFloors(summary, {
  minRecall: process.env.EVAL_MIN_RECALL ? Number(process.env.EVAL_MIN_RECALL) : undefined,
  minMrr: process.env.EVAL_MIN_MRR ? Number(process.env.EVAL_MIN_MRR) : undefined,
});
failures.forEach((f) => console.error(f));
if (failures.length) process.exit(1);
