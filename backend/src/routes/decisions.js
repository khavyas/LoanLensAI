import { Router } from 'express';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import { withCrossDocumentChecks } from '../services/verification.js';
import { assessApplication, canEnterCreditScore, evaluateDecision, validateCreditScore } from '../services/decisionRules.js';
import { isStaff } from '../config/roles.js';
import { runSimulatedChecks } from '../services/simulatedBureau.js';

// Review actions on an application: credit score entry and the decision
// itself (approve / reject / refer / return). All rules live in
// services/decisionRules.js; this file only loads, persists and audits.
const router = Router();
router.use(requireAuth);

async function load(req, res) {
  if (!isStaff(req.user.role)) {
    res.status(403).json({ error: 'Only loan officers and underwriters can review applications.' });
    return null;
  }
  const application = await Application.findById(req.params.id);
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return null;
  }
  const raw = await Document.find({ applicationId: application._id }).select('-fileData -storageKey').lean();
  const documents = withCrossDocumentChecks(application, raw);
  return { application, documents };
}

// Staff record the credit score from the credit report (no bureau integration
// yet). It feeds the "Credit score" parameter on the decision page.
router.put('/:id/credit-score', async (req, res, next) => {
  try {
    const loaded = await load(req, res);
    if (!loaded) return;
    const { application } = loaded;
    if (!canEnterCreditScore(req.user, application)) {
      return res.status(409).json({ error: 'The credit score can only be changed by whoever currently holds the file, before a decision is recorded.' });
    }
    const checked = validateCreditScore(req.body?.score);
    if (checked.error) return res.status(checked.error).json({ error: checked.message });

    application.creditProfile = { score: checked.score, enteredBy: req.user.email, enteredAt: new Date(), source: 'manual' };
    application.reviewHistory.push({
      at: new Date(),
      actor: { name: req.user.name, email: req.user.email, role: req.user.role },
      action: 'credit-score-entered',
      note: '',
      details: { score: checked.score },
    });
    await application.save();
    res.json({ ok: true, creditProfile: application.creditProfile });
  } catch (err) {
    next(err);
  }
});

// Runs the identity, sanctions and credit checks. Simulated in this build
// (services/simulatedBureau.js); a real provider plugs in at that one call.
// Only whoever currently holds the file may run it.
router.post('/:id/verify', async (req, res, next) => {
  try {
    const loaded = await load(req, res);
    if (!loaded) return;
    const { application } = loaded;
    if (!canEnterCreditScore(req.user, application)) {
      return res.status(409).json({ error: 'Checks can only be run by whoever currently holds the file, before a decision is recorded.' });
    }
    const report = runSimulatedChecks(application.toObject());
    application.verificationReport = report;
    if (report.credit.status === 'scored') {
      application.creditProfile = { score: report.credit.score, enteredBy: 'simulated-bureau', enteredAt: new Date(), source: 'simulated' };
    } else if (application.creditProfile?.source === 'simulated') {
      application.creditProfile = undefined; // a stale simulated score must not outlive a failed re-run
    }
    application.markModified('verificationReport');
    application.reviewHistory.push({
      at: new Date(),
      actor: { name: req.user.name, email: req.user.email, role: req.user.role },
      action: 'verification-run',
      note: '',
      details: { simulated: true, identity: report.identity.status, sanctions: report.sanctions.status, credit: report.credit.status },
    });
    await application.save();
    res.json({ ok: true, verificationReport: report });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/decision', async (req, res, next) => {
  try {
    const loaded = await load(req, res);
    if (!loaded) return;
    const { application, documents } = loaded;

    const assessment = assessApplication(application.toObject(), documents);
    const result = evaluateDecision({ user: req.user, application, assessment, body: req.body });
    if (result.error) return res.status(result.error).json({ error: result.message });

    application.status = result.status;
    if (result.decision) {
      application.decision = {
        ...result.decision,
        decidedBy: result.event.actor,
        decidedAt: result.event.at,
      };
    }
    application.reviewHistory.push(result.event);
    await application.save();
    res.json({ ok: true, status: application.status });
  } catch (err) {
    next(err);
  }
});

export default router;
