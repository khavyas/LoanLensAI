import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import PolicyChunk from '../models/PolicyChunk.js';
import { checkStorage } from '../services/storage.js';
import { ingestApprovedPolicies } from '../services/policyIngestion.js';
import { seedAll } from '../services/seedData.js';
import { indexAllApplications, loanFileRagEnabled, resetLoanFileIndex } from '../services/loanFileIndexer.js';
import { runRetrievalComparison, runRetrievalEval } from '../services/retrievalEval.js';
import { getAnswerEvalResults, getAnswerEvalState, startAnswerEval } from '../services/answerEvalServer.js';
import Feedback from '../models/Feedback.js';
import { goldenCandidates } from '../services/feedbackRecord.js';
import { createArena } from '../services/fraudArena/index.js';
import { ARENA_PAGE } from './arenaPage.js';

// One-time setup endpoints for environments with no shell access (Render free tier).
// Guarded by SETUP_SECRET; disable by unsetting the env var after setup.
const router = Router();

router.use((req, res, next) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret) return res.status(404).json({ error: 'Setup endpoints disabled' });
  if (req.headers['x-setup-secret'] !== secret && req.query.secret !== secret) {
    return res.status(403).json({ error: 'Bad setup secret' });
  }
  next();
});

async function runSeed() {
  const result = await seedAll();
  return { users: result.users, applications: result.applications };
}

async function runIngest() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const policyDir = path.resolve(__dirname, '../../../data/policies');
  await PolicyChunk.deleteMany({});

  const files = fs.readdirSync(policyDir).filter((f) => f.endsWith('.md'));
  let total = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(policyDir, file), 'utf8');
    const title = (raw.match(/^# (.+)$/m) || [null, file])[1].trim();
    const chunks = raw.split(/\n(?=## )/).map((s) => s.trim()).filter((s) => s.length > 40);
    await PolicyChunk.insertMany(
      chunks.map((text, i) => ({ sourceDoc: title, chunkIndex: i, text }))
    );
    total += chunks.length;
  }
  return { files: files.length, chunks: total };
}

// .all so these work from a plain browser address bar (GET) too — they're
// secret-guarded, idempotent demo setup, not production mutations.
router.all('/seed', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await runSeed()) });
  } catch (err) {
    next(err);
  }
});

router.all('/ingest', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await runIngest()) });
  } catch (err) {
    next(err);
  }
});

// Initial/reindex action for Chroma Cloud, usable on Render without a shell.
// Protected by the same SETUP_SECRET guard as the seed and Mongo policy routes.
router.all('/ingest-chroma', async (_req, res, next) => {
  try {
    res.json(await ingestApprovedPolicies());
  } catch (err) {
    next(err);
  }
});

// Builds (or rebuilds) the searchable index of every applicant's own file: application facts,
// extracted fields, verification results, document text and review record. Safe to repeat.
router.all('/index-applications', async (_req, res, next) => {
  try {
    if (!loanFileRagEnabled()) return res.json({ ok: false, message: 'Loan-file search is off: it needs CHAT_PROVIDER=ollama (and LOANFILE_RAG not set to off).' });
    res.json({ ok: true, ...(await indexAllApplications()) });
  } catch (err) {
    next(err);
  }
});

// Scores policy retrieval on THIS server with its real embedding and Chroma settings: recall@k,
// precision@k, MRR over the golden questions, and what each question actually retrieved. Run
// /admin/ingest-chroma first so the policies are indexed.
//   /admin/eval-retrieval                       the 18 original questions, current mode
//   /admin/eval-retrieval?set=v2                the 67 policy questions of the 125-question set
//   /admin/eval-retrieval?mode=hybrid           score hybrid search instead of vector-only
//   /admin/eval-retrieval?compare=1             both modes on the same questions, with the difference
router.all('/eval-retrieval', async (req, res, next) => {
  try {
    const set = req.query.set === 'v2' ? 'v2' : 'v1';
    if (req.query.compare) return res.json({ ok: true, ...(await runRetrievalComparison({ set: req.query.set === 'v1' ? 'v1' : 'v2' })) });
    res.json({ ok: true, ...(await runRetrievalEval({ set, mode: req.query.mode === 'hybrid' ? 'hybrid' : undefined })) });
  } catch (err) {
    next(err);
  }
});

// Answer-quality evaluation: the 125 golden questions (policy, the applicant's own file, status,
// out-of-scope, adversarial, follow-ups) asked through the real chat endpoint as borrower,
// officer and underwriter, and scored for behavior, facts, citations, groundedness and leaks.
// It takes several minutes, so it runs in the background:
//   /admin/eval-answers?start=1            start a full run (optional &category=policy&limit=10)
//   /admin/eval-answers                    progress, and the report when it has finished
//   /admin/eval-answers?full=1             the report plus every question and answer
// Run /admin/reset (or /admin/ingest-chroma and /admin/index-applications) first.
router.all('/eval-answers', async (req, res, next) => {
  try {
    if (req.query.start) {
      return res.json(await startAnswerEval({ category: req.query.category, limit: Number(req.query.limit) || undefined }));
    }
    const state = getAnswerEvalState();
    res.json(req.query.full ? { ...state, results: getAnswerEvalResults() } : state);
  } catch (err) {
    next(err);
  }
});

// Fraud Arena: forged applications run through the real document checks, scored live (plan FA-07).
//   /admin/arena                  the page (open it with ?secret=...)
//   /admin/arena/next[?count=25]  one more attack (or up to 100)
//   /admin/arena/report           the scoreboard so far
//   /admin/arena/reset[?seed=7]   clear it, optionally with a new seed
// Held in memory only: nothing is written to the database, and a redeploy clears it.
const arena = createArena({ seed: 1 });
router.get('/arena', (_req, res) => res.type('html').send(ARENA_PAGE));
router.all('/arena/next', (req, res) => {
  arena.batch(Math.min(Math.max(Number(req.query.count) || 1, 1), 100));
  res.json(arena.report());
});
router.all('/arena/report', (_req, res) => res.json(arena.report()));
router.all('/arena/reset', (req, res) => {
  const seed = Number.parseInt(req.query.seed, 10);
  arena.reset(Number.isFinite(seed) && seed >= 0 ? seed : 1);
  res.json(arena.report());
});

// Thumbs up/down left on assistant answers (text is stored redacted).
//   /admin/feedback                     the latest 50, with a count of up and down
//   /admin/feedback?rating=down         only the rated-down answers
//   /admin/feedback?rating=down&format=golden   the same as skeletons for the golden question set
router.all('/feedback', async (req, res, next) => {
  try {
    const filter = ['up', 'down'].includes(req.query.rating) ? { rating: req.query.rating } : {};
    const rows = await Feedback.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 200)).lean();
    if (req.query.format === 'golden') return res.json({ ok: true, candidates: goldenCandidates(rows) });
    res.json({
      ok: true,
      counts: { up: await Feedback.countDocuments({ rating: 'up' }), down: await Feedback.countDocuments({ rating: 'down' }) },
      feedback: rows.map((f) => ({ id: f._id, at: f.createdAt, role: f.role, rating: f.rating, question: f.question, answer: f.answer, comment: f.comment, sources: f.sources, promptVersion: f.promptVersion, retrievalMode: f.retrievalMode })),
    });
  } catch (err) {
    next(err);
  }
});

// One call for a full pre-demo reset — the whole point of "zero manual DB work".
router.all('/reset', async (_req, res, next) => {
  try {
    const seeded = await runSeed();
    const ingested = await runIngest();
    // The reseeded applications have new IDs: start the loan-file index fresh and rebuild it.
    let loanFiles = { enabled: false };
    if (loanFileRagEnabled()) {
      await resetLoanFileIndex();
      loanFiles = { enabled: true, ...(await indexAllApplications().catch((e) => ({ error: e.message }))) };
    }
    res.json({ ok: true, ...seeded, ...ingested, loanFiles });
  } catch (err) {
    next(err);
  }
});

// Proves file storage works from THIS server, with its real env vars: a tiny
// write -> read -> delete round trip against the configured bucket. Open
//   /admin/storage-check?secret=<SETUP_SECRET>
// after deploying; ok:true means uploads will really go to R2.
router.all('/storage-check', async (_req, res, next) => {
  try {
    res.json(await checkStorage());
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (_req, res, next) => {
  try {
    res.json({
      users: await User.countDocuments(),
      applications: await Application.countDocuments(),
      documents: await Document.countDocuments(),
      policyChunks: await PolicyChunk.countDocuments(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
