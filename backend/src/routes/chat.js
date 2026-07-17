import { Router } from 'express';
import Application from '../models/Application.js';
import { requireAuth } from '../middleware/auth.js';
import { answerQuestion } from '../services/rag.js';

const router = Router();
router.use(requireAuth);

router.post('/:applicationId', async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    const application = await Application.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (req.user.role !== 'officer' && application.applicantEmail !== req.user.email) {
      return res.status(403).json({ error: 'Not your application' });
    }

    const result = await answerQuestion({ question, application, role: req.user.role });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
