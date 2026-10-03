import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import mongoose from 'mongoose';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { classifyAndExtract } from '../services/extractionProvider.js';
import { storeFile, readStoredFile, deleteStoredFile } from '../services/storage.js';
import { verifyDocument, openExceptions, withCrossDocumentChecks } from '../services/verification.js';

// Server-side allowlist — the frontend picker already only offers image/PDF,
// but that's a UI convenience, not a security boundary. Without this, a
// direct API call (bypassing the picker entirely) could push any file type
// through to extraction, where it would silently misbehave (e.g. a .docx
// getting misread as an image) instead of being rejected cleanly here.
const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']);

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    const err = new Error(`Unsupported file type "${file.mimetype}" — upload an image (PNG/JPEG/WEBP) or PDF.`);
    err.status = 400;
    cb(err);
  },
});
const router = Router();
router.use(requireAuth);

// A borrower may only touch documents on their own application; an officer
// may touch any. Shared by the file/delete routes below (the upload route
// has its own inline copy since it needs the application object anyway).
async function loadOwnedApplication(applicationId, user) {
  const application = await Application.findById(applicationId);
  if (!application) return { error: 404, message: 'Application not found' };
  if (user.role !== 'officer' && application.applicantEmail !== user.email) {
    return { error: 403, message: 'Not your application' };
  }
  return { application };
}

// Upload a document image → classify → extract → verify, in one call.
// Pass `expectedDocType` (multipart field) for a targeted re-upload fixing one
// specific flagged/missing item — the previous 'current' document of that
// type is superseded (not deleted, for audit trail) rather than left sitting
// alongside the fix.
router.post('/:applicationId', upload.single('file'), async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (req.user.role !== 'officer' && application.applicantEmail !== req.user.email) {
      return res.status(403).json({ error: 'Not your application' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const expectedDocType = req.body.expectedDocType || undefined;
    const extracted = await classifyAndExtract(req.file.path, req.file.mimetype, req.file.originalname);
    const verification = verifyDocument(application, extracted, { expectedDocType });
    // Keep the bytes so the document can be previewed/downloaded later —
    // read before the temp file is cleaned up below. Where they end up
    // (MongoDB or the private R2 bucket) is storage.js's decision.
    const fileBytes = fs.readFileSync(req.file.path);

    // Supersede whatever previously occupied this slot so the fix replaces it
    // instead of sitting alongside it. A targeted re-upload (expectedDocType
    // set) must match on the *slot* being fixed, not just the classified
    // docType — otherwise a wrong-file attempt (e.g. uploading a bank
    // statement while fixing "drivers license") gets classified under its
    // own docType, is never superseded by the correct file that follows, and
    // lingers forever as a stray open exception. Matching on docType OR a
    // prior expectedDocType covers both a valid predecessor and a previous
    // wrong-type attempt at the same slot.
    const supersedeQuery = expectedDocType
      ? { applicationId: application._id, status: 'current', $or: [{ docType: expectedDocType }, { expectedDocType }] }
      : { applicationId: application._id, status: 'current', docType: extracted.docType };
    const priorCurrent = await Document.find(supersedeQuery);
    if (priorCurrent.length) {
      await Document.updateMany(
        { _id: { $in: priorCurrent.map((d) => d._id) } },
        { $set: { status: 'superseded' } }
      );
    }

    // The object-storage key contains the document id, so the id is minted
    // here instead of by Mongo on insert.
    const documentId = new mongoose.Types.ObjectId();
    const stored = await storeFile({
      applicationId: application._id,
      documentId,
      mimeType: req.file.mimetype,
      bytes: fileBytes,
    });

    let doc;
    try {
      doc = await Document.create({
        _id: documentId,
        applicationId: application._id,
        fileName: req.file.originalname,
        docType: extracted.docType,
        ...stored,
        mimeType: req.file.mimetype,
        extractedFields: extracted.fields,
        confidence: extracted.confidence,
        extractionSource: extracted.extractionSource || 'live',
        verification,
        status: 'current',
        supersedes: priorCurrent[0]?._id || null,
        expectedDocType,
      });
    } catch (err) {
      await deleteStoredFile(stored); // don't leave an orphan object if the record failed to save
      throw err;
    }

    // A 'warning'-level flag (e.g. an affordability check) is just as important
    // for an officer to see in their queue as a hard 'fail' — both mean a human
    // needs to look, so both surface at the application level, not just inside
    // this document's own verification detail. Recomputed from ALL current
    // documents (not just the one just uploaded) so a cross-document finding —
    // e.g. a bank deposit that doesn't back up the pay stub's net pay — also
    // reopens review even though neither document is individually flagged.
    const allDocs = await Document.find({ applicationId: application._id }).lean();
    const augmented = withCrossDocumentChecks(application, allDocs);
    const hasFlaggedDocs = openExceptions(application, augmented).some((e) => e.type === 'flagged');
    if (hasFlaggedDocs) {
      application.status = 'needs-review';
      await application.save();
    } else if (application.status === 'needs-review') {
      // Self-healing: if this fix cleared every open exception, don't leave
      // the application sitting in the officer's "needs review" queue —
      // that's the whole point of a live, self-service fix.
      application.status = 'submitted';
      await application.save();
    }

    fs.unlink(req.file.path, () => {}); // temp disk copy only — the real copy is in storage
    // Don't echo the raw bytes or the internal storage key back — the
    // frontend only ever needs the dedicated file route below.
    const { fileData: _omit, storageKey: _key, ...docWithoutBytes } = doc.toObject();
    res.status(201).json(docWithoutBytes);
  } catch (err) {
    next(err);
  }
});

// Serve the raw uploaded bytes for preview/download. `inline` (not
// `attachment`) so it opens directly in a browser tab — the user can still
// save it from there (right-click / Ctrl+S) same as any other page.
router.get('/:documentId/file', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const owned = await loadOwnedApplication(doc.applicationId, req.user);
    if (owned.error) return res.status(owned.error).json({ error: owned.message });
    // Proxied through the server (not a redirect to a storage URL) so the
    // browser's authenticated fetch keeps working with no CORS setup and the
    // bucket never needs a public address.
    let bytes;
    try {
      bytes = await readStoredFile(doc);
    } catch (err) {
      console.error('[documents] could not read stored file', req.params.documentId, err.message);
      return res.status(502).json({ error: 'File storage is temporarily unavailable. Please try again.' });
    }
    if (!bytes) return res.status(404).json({ error: 'No file stored for this document' });

    res.set('Content-Type', doc.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${(doc.fileName || 'document').replace(/"/g, '')}"`);
    res.send(bytes);
  } catch (err) {
    next(err);
  }
});

// Remove a document outright (distinct from a targeted re-upload, which
// supersedes and keeps the old one for audit trail) — the required item it
// covered simply goes back to "missing" on the next fetch.
router.delete('/:documentId', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const owned = await loadOwnedApplication(doc.applicationId, req.user);
    if (owned.error) return res.status(owned.error).json({ error: owned.message });

    await Document.deleteOne({ _id: doc._id });
    await deleteStoredFile(doc); // best effort; never fails the request
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
