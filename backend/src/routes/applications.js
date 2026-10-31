import { Router } from 'express';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { missingDocuments, openExceptions, withCrossDocumentChecks } from '../services/verification.js';
import { withoutCredits } from '../services/statementAnalysis.js';
import { REQUIRED_DOCS_BY_PRODUCT, PRODUCT_TYPES } from '../config/requiredDocs.js';
import { AFFORDABILITY, maxAffordableAmount, maxAffordableBusinessAmount } from '../config/affordability.js';
import { isStaff } from '../config/roles.js';
import { assessApplication, borrowerNotice } from '../services/decisionRules.js';
import { validateResidency } from '../services/residency.js';
import { duplicateMatchesFor } from '../services/duplicateCheck.js';
import { EDITABLE_STATUSES, editableFields, reverifyDocuments, statusAfterEdit, validateEdit } from '../services/applicationEdit.js';

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

// A borrower must never receive the internal review record: the credit score
// entry, the audit trail, or an underwriter's exception rationale and
// relationship note. They get the outcome and plain-language notice instead.
export function forViewer(app, role) {
  if (isStaff(role)) return app;
  const { creditProfile, reviewHistory, decision, verificationReport, ...safe } = app; // eslint-disable-line no-unused-vars
  return { ...safe, decisionNotice: borrowerNotice(app) };
}

// Officers see all applications; borrowers see only their own.
// 'submitted' only ever meant "the application was filed" — it says nothing
// about whether required documents are still outstanding, which is exactly
// why a brand-new application with zero uploads still showed as plain
// "Submitted" with no hint that anything was needed from the applicant.
// missingDocumentsCount lets the list view show that at a glance.
router.get('/', async (req, res, next) => {
  try {
    const filter = isStaff(req.user.role) ? {} : { applicantEmail: req.user.email };
    const apps = await Application.find(filter).sort({ createdAt: -1 }).lean();

    const appIds = apps.map((a) => a._id);
    const allDocs = await Document.find({ applicationId: { $in: appIds } }).select('-fileData -storageKey').lean();
    const docsByApp = new Map();
    for (const doc of allDocs) {
      const key = doc.applicationId.toString();
      if (!docsByApp.has(key)) docsByApp.set(key, []);
      docsByApp.get(key).push(doc);
    }

    const withMissing = apps.map((app) =>
      forViewer(
        {
          ...app,
          missingDocumentsCount: missingDocuments(app, docsByApp.get(app._id.toString()) || []).length,
        },
        req.user.role
      )
    );

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
    const { productType, requestedAmount, employerName, employerPhone, loanReason, repaymentTermMonths, address, ssnLast4, dateOfBirth, consentAccepted } = req.body;
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

    const residency = validateResidency(req.body);
    if (residency.error) return res.status(residency.error).json({ error: residency.message });

    const application = {
      ...residency,
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
      // Real-time ceiling from the self-reported figure — previously this
      // was only checked AFTER a tax-return document was uploaded and
      // extracted, so a borrower could request an unaffordable amount and
      // not find out until well into the application.
      const maxAffordable = maxAffordableBusinessAmount(statedAnnualBusinessRevenue);
      if (requestedAmount > maxAffordable) {
        return res.status(400).json({
          error: `Based on a stated annual revenue of $${Number(statedAnnualBusinessRevenue).toLocaleString('en-US')}, the maximum you can request is ~$${Math.round(maxAffordable).toLocaleString('en-US')}. Lower the requested amount.`,
        });
      }
      Object.assign(application, { businessName, statedAnnualBusinessRevenue });
    } else {
      const { statedMonthlyIncome } = req.body;
      if (!statedMonthlyIncome) {
        return res.status(400).json({ error: 'statedMonthlyIncome is required for this product' });
      }
      const termOptions = AFFORDABILITY[productType].termOptions;
      if (!termOptions.includes(Number(repaymentTermMonths))) {
        return res.status(400).json({ error: `repaymentTermMonths must be one of: ${termOptions.join(', ')}` });
      }
      const maxAffordable = maxAffordableAmount(productType, statedMonthlyIncome, Number(repaymentTermMonths));
      if (requestedAmount > maxAffordable) {
        return res.status(400).json({
          error: `Based on a stated monthly income of $${Number(statedMonthlyIncome).toLocaleString('en-US')} and a ${repaymentTermMonths}-month term, the maximum you can request is ~$${Math.round(maxAffordable).toLocaleString('en-US')}. Lower the amount or choose a longer term.`,
        });
      }
      Object.assign(application, { statedMonthlyIncome, employerName, employerPhone, repaymentTermMonths: Number(repaymentTermMonths) });
    }

    const app = await Application.create({
      ...application,
      address,
      ssnLast4,
      requestedAmount,
      loanReason,
      requiredDocTypes: REQUIRED_DOCS_BY_PRODUCT[productType],
      status: 'submitted',
      reviewHistory: [{ at: new Date(), actor: { name: req.user.name, email: req.user.email, role: req.user.role }, action: 'submitted', note: '' }],
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
    if (!isStaff(req.user.role) && app.applicantEmail !== req.user.email) {
      return res.status(403).json({ error: 'Not your application' });
    }
    // Never include the raw file bytes here — the frontend fetches those on
    // demand from GET /documents/:id/file, not inline with the whole app.
    const rawDocuments = await Document.find({ applicationId: app._id }).select('-fileData -storageKey').lean();
    const documents = withCrossDocumentChecks(app, rawDocuments);
    res.json(
      forViewer(
        {
          ...app,
          documents: documents.map(withoutCredits),
          missingDocuments: missingDocuments(app, documents),
          openExceptions: openExceptions(app, documents),
          edit: {
            allowed: EDITABLE_STATUSES.includes(app.status),
            fields: editableFields(app.productType),
            termOptions: AFFORDABILITY[app.productType]?.termOptions || null,
          },
          // Staff-only: which of the bank's parameters this file meets.
          ...(isStaff(req.user.role)
            ? { assessment: assessApplication(app, documents, { duplicates: await duplicateMatchesFor(app) }) }
            : {}),
        },
        req.user.role
      )
    );
  } catch (err) {
    next(err);
  }
});

// A borrower correcting their own application (see services/applicationEdit.js for the
// rules). Every document is re-verified against the corrected values and the change is
// written to the review history, old value -> new value.
router.put('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'borrower') {
      return res.status(403).json({ error: 'Only the applicant can edit their application.' });
    }
    const application = await Application.findById(req.params.id);
    if (!application || application.applicantEmail !== req.user.email) {
      // Same answer for "not found" and "not yours", so ids cannot be probed.
      return res.status(404).json({ error: 'Application not found' });
    }

    const checked = validateEdit(application.toObject(), req.body);
    if (checked.error) return res.status(checked.error).json({ error: checked.message });

    application.set(checked.updates);
    const plain = application.toObject();

    const documents = await Document.find({ applicationId: application._id }).select('-fileData -storageKey');
    const reverified = reverifyDocuments(plain, documents.map((d) => d.toObject()));
    const byId = new Map(reverified.map((r) => [String(r.id), r.verification]));
    for (const doc of documents) {
      if (byId.has(String(doc._id))) {
        doc.verification = byId.get(String(doc._id));
        await doc.save();
      }
    }

    application.status = statusAfterEdit(plain, documents.map((d) => d.toObject()));
    application.reviewHistory.push({
      at: new Date(),
      actor: { name: req.user.name, email: req.user.email, role: req.user.role },
      action: 'application-edited',
      note: '',
      details: { changes: checked.diff },
    });
    await application.save();
    res.json({ ok: true, status: application.status, changes: checked.diff });
  } catch (err) {
    next(err);
  }
});

export default router;
