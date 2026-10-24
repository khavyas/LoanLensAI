import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks, openExceptions } from '../../src/services/verification.js';
import { runSimulatedChecks } from '../../src/services/simulatedBureau.js';
import { assessApplication } from '../../src/services/decisionRules.js';

// Runs the real seed definitions through the real document checks, the
// simulated bureau and the decision assessment — the five jury stories, no database.
const NOW = new Date('2026-10-24T12:00:00Z');

function load(name) {
  const def = APPLICATIONS.find((a) => a.applicantName === name);
  const docs = (DOCUMENT_FILES[name] || []).map((file) => {
    const extracted = mockClassifyAndExtract(file);
    return {
      docType: extracted.docType,
      status: 'current',
      extractedFields: extracted.fields,
      verification: verifyDocument(def, extracted, { now: NOW }),
    };
  });
  return { def, docs: withCrossDocumentChecks(def, docs) };
}

function story(name) {
  const { def, docs } = load(name);
  const report = runSimulatedChecks(def, { now: NOW });
  const app = {
    ...def,
    verificationReport: report,
    creditProfile: report.credit.status === 'scored' ? { score: report.credit.score, source: 'simulated' } : undefined,
  };
  return { app, docs, report, assessment: assessApplication(app, docs), exceptions: openExceptions(def, docs) };
}

const param = (a, key) => a.parameters.find((p) => p.key === key);

test('Priya Nair: clean documents, clean bureau — a loan officer can approve', () => {
  const s = story('Priya Nair');
  assert.deepEqual(s.assessment.unmetKeys, []);
  assert.equal(s.assessment.canApprove, true);
  assert.equal(s.report.credit.score, 742);
  assert.equal(s.exceptions.length, 0);
});

test('Arjun Mehta: score 598 is the only shortfall, so the file can be referred for an exception', () => {
  const s = story('Arjun Mehta');
  assert.equal(s.report.credit.score, 598);
  assert.deepEqual(s.assessment.unmetKeys, ['credit-score']);
  assert.equal(s.assessment.canApprove, false);
  assert.equal(s.assessment.canRefer, true);
});

test('Rohan Desai: documents are clean but the SSN belongs to someone else — identity fails and cannot be waived', () => {
  const s = story('Rohan Desai');
  assert.equal(s.exceptions.length, 0, 'his documents themselves are fine');
  assert.equal(s.report.identity.status, 'failed');
  assert.equal(s.report.credit.status, 'not-run');
  assert.equal(param(s.assessment, 'identity-verification').status, 'unmet');
  assert.equal(s.assessment.canApprove, false);
  assert.equal(s.assessment.canRefer, false);
  assert.ok(s.assessment.blockers.some((b) => b.key === 'identity-verification'));
  assert.equal(JSON.stringify(s.report).includes('Nambiar'), false, 'the other person is never named');
});

test('Meera Iyer: the bureau is clean but her expired license is rejected as a document', () => {
  const s = story('Meera Iyer');
  assert.equal(s.report.identity.status, 'verified');
  assert.equal(s.report.credit.score, 715);
  const idCheck = s.docs.flatMap((d) => d.verification.checks).find((c) => c.field === 'ID expiry');
  assert.equal(idCheck.status, 'mismatch');
  assert.match(idCheck.explanation, /expired on 04\/30\/2026/);
  assert.equal(s.exceptions.some((e) => e.docType === 'drivers-license'), true, 'shows up in Action Needed for re-upload');
  assert.equal(param(s.assessment, 'identity').status, 'unmet');
  assert.equal(s.assessment.canRefer, false);
});

test('Kavya Reddy: no credit history means no score — it cannot proceed without manual review', () => {
  const s = story('Kavya Reddy');
  assert.equal(s.report.credit.status, 'thin-file');
  assert.equal(s.exceptions.length, 0);
  assert.equal(param(s.assessment, 'credit-score').status, 'pending');
  assert.match(param(s.assessment, 'credit-score').detail, /thin file/i);
  assert.equal(s.assessment.canApprove, false);
  assert.equal(s.assessment.canRefer, false);
});

test('nothing is approvable until the identity and credit checks have been run', () => {
  const { def, docs } = load('Priya Nair');
  const a = assessApplication(def, docs);
  assert.equal(param(a, 'identity-verification').status, 'pending');
  assert.equal(param(a, 'sanctions').status, 'pending');
  assert.equal(a.canApprove, false);
});

test('a sanctions-list hit blocks the file, and a credit freeze returns no score', () => {
  const hit = runSimulatedChecks({ applicantName: 'Test Person', ssnLast4: '0911' }, { now: NOW });
  assert.equal(hit.sanctions.status, 'potential-match');
  const frozen = runSimulatedChecks({ applicantName: 'Test Person', ssnLast4: '0912' }, { now: NOW });
  assert.equal(frozen.credit.status, 'frozen');
});

test('an SSN with no scripted record behaves like a clean borrower, and is labelled as such', () => {
  const r = runSimulatedChecks({ applicantName: 'New Tester', ssnLast4: '1357' }, { now: NOW });
  assert.equal(r.identity.status, 'verified');
  assert.equal(r.credit.score, 700);
  assert.equal(r.scripted, false);
  assert.equal(r.source, 'simulated');
});

test('license checks: date of birth and address mismatches are caught, a moved address is only a warning', () => {
  const extracted = mockClassifyAndExtract('priya-nair-drivers-license.png');
  const app = { applicantName: 'Priya Nair', dateOfBirth: new Date('1990-01-01'), address: '5 Other Street, Springfield' };
  const checks = verifyDocument(app, extracted, { now: NOW }).checks;
  assert.equal(checks.find((c) => c.field === 'Date of birth').status, 'mismatch');
  assert.equal(checks.find((c) => c.field === 'Address').status, 'warning');
  assert.equal(checks.find((c) => c.field === 'ID expiry').status, 'match');
});

test('address comparison ignores street-suffix spelling ("Street" vs "St.")', () => {
  const extracted = mockClassifyAndExtract('arjun-mehta-drivers-license.png');
  const app = { applicantName: 'Arjun Mehta', address: '17 Birch St., Springfield' };
  assert.equal(verifyDocument(app, extracted, { now: NOW }).checks.find((c) => c.field === 'Address').status, 'match');
});
