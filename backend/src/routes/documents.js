import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { classifyAndExtract } from '../services/extraction.js';
import { verifyDocument } from '../services/verification.js';

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();
router.use(requireAuth);

// Upload a document image → classify → extract → verify, in one call.
router.post('/:applicationId', upload.single('file'), async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const extracted = await classifyAndExtract(req.file.path, req.file.mimetype);
    const verification = verifyDocument(application, extracted);

    const doc = await Document.create({
      applicationId: application._id,
      fileName: req.file.originalname,
      docType: extracted.docType,
      extractedFields: extracted.fields,
      confidence: extracted.confidence,
      verification,
    });

    if (verification.overall === 'fail') {
      application.status = 'needs-review';
      await application.save();
    }

    fs.unlink(req.file.path, () => {}); // POC: don't retain uploads
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

export default router;
