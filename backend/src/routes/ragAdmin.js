import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { RAG_CONFIG } from '../config/rag.js';
import { extractPolicyText } from '../services/policyFileText.js';
import { deletePolicyRecords, getCollectionRecords, getOrCreatePolicyCollection } from '../services/chromaService.js';
import { ingestPolicyText } from '../services/policyIngestion.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

router.use(requireAuth, requireRole('admin'));

function safeFileName(originalName) {
  const base = path.basename(String(originalName || '')).normalize('NFKC').replace(/[^\w .()-]/g, '_').trim();
  if (!base || base.startsWith('.')) throw new Error('Each file needs a valid visible filename.');
  const ext = path.extname(base).toLowerCase();
  if (!['.md', '.txt', '.pdf'].includes(ext)) throw new Error('Upload Markdown (.md), text (.txt), or text-based PDF (.pdf) policy files.');
  return base;
}

router.get('/documents', async (_req, res, next) => {
  try {
    const collectionId = await getOrCreatePolicyCollection();
    const records = await getCollectionRecords(collectionId, { category: { $eq: 'loan-policy' } });
    const grouped = new Map();
    (records.ids || []).forEach((id, index) => {
      const metadata = records.metadatas?.[index] || {};
      if (!metadata.documentId) return;
      const item = grouped.get(metadata.documentId) || {
        documentId: metadata.documentId,
        sourceFile: metadata.sourceFile || 'Policy document',
        sourceTitle: metadata.sourceTitle || metadata.sourceFile || 'Policy document',
        modifiedAt: metadata.modifiedAt || null,
        chunks: 0,
      };
      item.chunks += 1;
      grouped.set(metadata.documentId, item);
    });
    res.json({ documents: [...grouped.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile)) });
  } catch (error) {
    next(error);
  }
});

router.post('/documents', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Choose at least one policy file to upload.' });
    const results = [];
    const errors = [];
    for (const file of req.files) {
      try {
        const fileName = safeFileName(file.originalname);
        const text = await extractPolicyText(fileName, file.buffer);
        results.push(await ingestPolicyText({ text, fileName, modifiedAt: new Date().toISOString() }));
      } catch (error) {
        errors.push({ file: path.basename(file.originalname || 'unknown'), error: error.message });
      }
    }
    res.status(errors.length ? 207 : 200).json({ uploaded: results, errors });
  } catch (error) {
    next(error);
  }
});

router.delete('/documents/:documentId', async (req, res, next) => {
  try {
    const documentId = String(req.params.documentId || '');
    if (!/^policy-[a-f0-9]{20}$/.test(documentId)) return res.status(400).json({ error: 'Invalid policy document ID.' });
    const collectionId = await getOrCreatePolicyCollection();
    const records = await getCollectionRecords(collectionId, { documentId: { $eq: documentId } });
    const ids = records.ids || [];
    if (!ids.length) return res.status(404).json({ error: 'Policy document not found.' });
    await deletePolicyRecords(collectionId, ids);
    res.json({ ok: true, deletedChunks: ids.length });
  } catch (error) {
    next(error);
  }
});

router.get('/status', async (_req, res, next) => {
  try {
    const collectionId = await getOrCreatePolicyCollection();
    const records = await getCollectionRecords(collectionId, { category: { $eq: 'loan-policy' } });
    res.json({ ok: true, collection: RAG_CONFIG.chromaCollection, chunks: (records.ids || []).length });
  } catch (error) {
    next(error);
  }
});

export default router;
