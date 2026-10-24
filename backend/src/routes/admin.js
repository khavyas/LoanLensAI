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

// One call for a full pre-demo reset — the whole point of "zero manual DB work".
router.all('/reset', async (_req, res, next) => {
  try {
    const seeded = await runSeed();
    const ingested = await runIngest();
    res.json({ ok: true, ...seeded, ...ingested });
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
