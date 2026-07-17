import { Router } from 'express';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { missingDocuments } from '../services/verification.js';

const router = Router();
router.use(requireAuth);

// Officers see all applications; borrowers see only their own.
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'officer' ? {} : { applicantEmail: req.user.email };
    const apps = await Application.find(filter).sort({ createdAt: -1 }).lean();
    res.json(apps);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id).lean();
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (req.user.role !== 'officer' && app.applicantEmail !== req.user.email) {
      return res.status(403).json({ error: 'Not your application' });
    }
    const documents = await Document.find({ applicationId: app._id }).lean();
    res.json({ ...app, documents, missingDocuments: missingDocuments(app, documents) });
  } catch (err) {
    next(err);
  }
});

export default router;
