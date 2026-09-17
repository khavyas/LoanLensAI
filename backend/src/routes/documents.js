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

    fs.unlink(req.file.path, () => {}); // POC: don't retain uploads
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

export default router;
