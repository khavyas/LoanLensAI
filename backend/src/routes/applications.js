import { Router } from 'express';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { missingDocuments, openExceptions } from '../services/verification.js';
import { REQUIRED_DOCS_BY_PRODUCT, PRODUCT_TYPES } from '../config/requiredDocs.js';

const router = Router();
router.use(requireAuth);

// Every product policy states "18 or older," but nothing previously checked
// it — there was no dateOfBirth field on the application at all.
function ageOnDate(dateOfBirth, on = new Date()) {
  const dob = new Date(dateOfBirth);
  let age = on.getFullYear() - dob.getFullYear();
  const monthDiff = on.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

// Officers see all applications; borrowers see only their own.
// 'submitted' only ever meant "the application was filed" — it says nothing
// about whether required documents are still outstanding, which is exactly
// why a brand-new application with zero uploads still showed as plain
// "Submitted" with no hint that anything was needed from the applicant.
// missingDocumentsCount lets the list view show that at a glance.
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'officer' ? {} : { applicantEmail: req.user.email };
    const apps = await Application.find(filter).sort({ createdAt: -1 }).lean();

    const appIds = apps.map((a) => a._id);
    const allDocs = await Document.find({ applicationId: { $in: appIds } }).lean();
    const docsByApp = new Map();
    for (const doc of allDocs) {
      const key = doc.applicationId.toString();
      if (!docsByApp.has(key)) docsByApp.set(key, []);
      docsByApp.get(key).push(doc);
    }

    const withMissing = apps.map((app) => ({
      ...app,
      missingDocumentsCount: missingDocuments(app, docsByApp.get(app._id.toString()) || []).length,
    }));

    res.json(withMissing);
  } catch (err) {
    next(err);
  }
});

// "Apply for a loan" — a borrower creates their own application. Officers
// review/manage applications but don't file one for themselves here (staff-
// assisted intake, if ever needed, is a separate concern from this form).
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'borrower') {
      return res.status(403).json({ error: 'Only borrowers can apply for a loan' });
    }
    const { productType, requestedAmount, employerName, address, ssnLast4, dateOfBirth, consentAccepted } = req.body;
    if (!PRODUCT_TYPES.includes(productType)) {
      return res.status(400).json({ error: `productType must be one of: ${PRODUCT_TYPES.join(', ')}` });
    }
    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ error: 'requestedAmount is required and must be positive' });
    }
    if (!dateOfBirth || Number.isNaN(new Date(dateOfBirth).getTime())) {
      return res.status(400).json({ error: 'A valid dateOfBirth is required' });
    }
    if (ageOnDate(dateOfBirth) < 18) {
      return res.status(400).json({ error: 'Applicants must be 18 or older' });
    }
    if (!consentAccepted) {
      return res.status(400).json({ error: 'You must authorize identity/credit verification and e-sign consent to apply' });
    }

    const application = {
      applicantName: req.user.name,
      applicantEmail: req.user.email,
      productType,
      dateOfBirth,
      consentAcceptedAt: new Date(),
    };
    if (productType === 'small-business-loan') {
      const { businessName, statedAnnualBusinessRevenue } = req.body;
      if (!businessName || !statedAnnualBusinessRevenue) {
        return res.status(400).json({ error: 'businessName and statedAnnualBusinessRevenue are required for a small business loan' });
      }
      Object.assign(application, { businessName, statedAnnualBusinessRevenue });
    } else {
      const { statedMonthlyIncome } = req.body;
      if (!statedMonthlyIncome) {
        return res.status(400).json({ error: 'statedMonthlyIncome is required for this product' });
      }
      Object.assign(application, { statedMonthlyIncome, employerName });
    }

    const app = await Application.create({
      ...application,
      address,
      ssnLast4,
      requestedAmount,
      requiredDocTypes: REQUIRED_DOCS_BY_PRODUCT[productType],
      status: 'submitted',
    });
    res.status(201).json(app);
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
    res.json({
      ...app,
      documents,
      missingDocuments: missingDocuments(app, documents),
      openExceptions: openExceptions(app, documents),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
