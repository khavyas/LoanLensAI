import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import PolicyChunk from '../models/PolicyChunk.js';

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

const REQUIRED_DOCS = ['pay-stub', 'drivers-license', 'bank-statement'];

router.post('/seed', async (_req, res, next) => {
  try {
    await Promise.all([User.deleteMany({}), Application.deleteMany({}), Document.deleteMany({})]);
    const passwordHash = await bcrypt.hash('demo1234', 10);
    await User.create([
      { email: 'officer@loanlens.demo', passwordHash, name: 'Olivia Officer', role: 'officer' },
      { email: 'borrower@loanlens.demo', passwordHash, name: 'Jordan Rivera', role: 'borrower' },
    ]);
    const apps = await Application.create([
      {
        applicantName: 'Jordan Rivera',
        applicantEmail: 'borrower@loanlens.demo',
        productType: 'auto-loan',
        statedMonthlyIncome: 5000,
        employerName: 'Brightline Logistics',
        address: '412 Maple Court, Springfield',
        ssnLast4: '4821',
        requestedAmount: 28000,
        requiredDocTypes: REQUIRED_DOCS,
      },
      {
        applicantName: 'Priya Nair',
        applicantEmail: 'priya.nair@example.demo',
        productType: 'personal-loan',
        statedMonthlyIncome: 7200,
        employerName: 'Cedar Health Systems',
        address: '88 Lakeview Drive, Springfield',
        ssnLast4: '9034',
        requestedAmount: 15000,
        requiredDocTypes: REQUIRED_DOCS,
      },
      {
        applicantName: 'Marcus Webb',
        applicantEmail: 'marcus.webb@example.demo',
        productType: 'auto-loan',
        statedMonthlyIncome: 3900,
        employerName: 'Ironwood Manufacturing',
        address: '17 Birch Street, Springfield',
        ssnLast4: '5567',
        requestedAmount: 19500,
        requiredDocTypes: REQUIRED_DOCS,
      },
    ]);
    res.json({ ok: true, users: 2, applications: apps.length });
  } catch (err) {
    next(err);
  }
});

router.post('/ingest', async (_req, res, next) => {
  try {
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
    res.json({ ok: true, files: files.length, chunks: total });
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
