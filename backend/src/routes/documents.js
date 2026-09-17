import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { classifyAndExtract } from '../services/extraction.js';
import { verifyDocument, openExceptions } from '../services/verification.js';

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });
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
    // Read the bytes into Mongo so the document can be previewed/downloaded
    // later — read before the temp file is cleaned up below.
    const fileData = fs.readFileSync(req.file.path);

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

    const doc = await Document.create({
      applicationId: application._id,
      fileName: req.file.originalname,
      docType: extracted.docType,
      fileData,
      mimeType: req.file.mimetype,
      extractedFields: extracted.fields,
      confidence: extracted.confidence,
      verification,
      status: 'current',
      supersedes: priorCurrent[0]?._id || null,
      expectedDocType,
    });

    // A 'warning'-level flag (e.g. an affordability check) is just as important
    // for an officer to see in their queue as a hard 'fail' — both mean a human
    // needs to look, so both surface at the application level, not just inside
    // this document's own verification detail.
    if (verification.overall === 'fail' || verification.overall === 'needs-review') {
      application.status = 'needs-review';
      await application.save();
    } else if (application.status === 'needs-review') {
      // Self-healing: if this fix cleared every open exception, don't leave
      // the application sitting in the officer's "needs review" queue —
      // that's the whole point of a live, self-service fix.
      const allDocs = await Document.find({ applicationId: application._id });
      if (openExceptions(application, allDocs).length === 0) {
        application.status = 'submitted';
        await application.save();
      }
    }

    fs.unlink(req.file.path, () => {}); // temp disk copy only — the real copy is fileData above
    // Don't echo fileData back in the create response — the frontend never
    // needs the raw bytes inline, only the dedicated file route below.
    const { fileData: _omit, ...docWithoutBytes } = doc.toObject();
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
    if (!doc.fileData) return res.status(404).json({ error: 'No file stored for this document' });

    res.set('Content-Type', doc.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${(doc.fileName || 'document').replace(/"/g, '')}"`);
    res.send(doc.fileData);
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
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
