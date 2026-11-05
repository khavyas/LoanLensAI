import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATIONS, DOCUMENT_FILES } from '../../src/services/seedData.js';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../../src/services/verification.js';
import { runSimulatedChecks } from '../../src/services/simulatedBureau.js';
import { assessApplication } from '../../src/services/decisionRules.js';
import { runCourtroom, buildDebate, soundsLikeVerdict } from '../../src/services/courtroom.js';
import { DEMO_CASES, demoCaseFor } from '../../src/config/demoCaseFiles.js';

const NOW = new Date('2026-11-05T12:00:00Z');
const quiet = { info() {}, warn() {} };

function file(name) {
  const def = APPLICATIONS.find((a) => a.applicantName === name);
  const docs = withCrossDocumentChecks(def, (DOCUMENT_FILES[name] || []).map((f) => {
    const ex = mockClassifyAndExtract(f);
    return { docType: ex.docType, status: 'current', extractedFields: ex.fields, verification: verifyDocument(def, ex, { now: NOW }) };
  }));
  const report = runSimulatedChecks(def, { now: NOW });
  const app = { ...def, verificationReport: report, creditProfile: report.credit.status === 'scored' ? { score: report.credit.score } : undefined };
  return { app, docs, assessment: assessApplication(app, docs) };
}

const hear = (name) => {
  const { app, docs, assessment } = file(name);
  return runCourtroom({ application: app, documents: docs, assessment, demoCase: demoCaseFor(app), generate: null, log: quiet });
};

test('the three scripted cases match only their own name and SSN', () => {
  assert.equal(DEMO_CASES.length, 3);
  assert.ok(demoCaseFor({ applicantName: 'Meera Iyer', ssnLast4: '2218' }));
  assert.equal(demoCaseFor({ applicantName: 'Meera Iyer', ssnLast4: '0000' }), null, 'a different SSN is a different person');
  assert.equal(demoCaseFor({ applicantName: 'Someone Else', ssnLast4: '2218' }), null);
  assert.equal(demoCaseFor(null), null);
});

test('no scripted line tells the officer what to decide', () => {
  for (const c of DEMO_CASES) {
    for (const p of [...c.for, ...c.against]) {
      for (const text of [p.text, p.reply?.text].filter(Boolean)) assert.equal(soundsLikeVerdict(text), false, text);
    }
  }
});

test('every scripted point cites a scripted exhibit, and every reply comes from the other side', () => {
  for (const c of DEMO_CASES) {
    for (const p of [...c.for, ...c.against]) {
      assert.ok(p.cites.length > 0);
      assert.ok(p.cites.every((x) => x.kind === 'exhibit' && /^X\d$/.test(x.label)));
      if (p.reply) assert.ok(p.reply.cites.length > 0);
    }
  }
});

test('Meera: the spending story is argued, and the expired licence is still heard', async () => {
  const r = await hear('Meera Iyer');
  assert.equal(r.eligible, true);
  assert.equal(r.scripted, true);
  const all = r.against.points.map((p) => p.text).join(' ');
  assert.match(all, /Swiggy 23, Zomato 18/);
  assert.match(all, /\$162/);
  assert.match(all, /ID expiry/i, 'the record-derived flag survives next to the scripted points');
});

test('Jordan: opens even though he has no documents, because the income history is the contest', async () => {
  const r = await hear('Jordan Rivera');
  assert.equal(r.eligible, true);
  assert.match(r.against.points[0].text, /Three employers in twelve months/);
  assert.ok(r.reasons.some((x) => /income stability/.test(x)));
});

test('Priya: perfect paperwork, but the failed background screening puts her in court', async () => {
  const r = await hear('Priya Nair');
  assert.equal(r.eligible, true);
  const against = r.against.points.map((p) => p.text).join(' ');
  assert.match(against, /FIR/);
  assert.match(against, /Requirement not met: Sanctions screening/, 'the record-derived requirement is on the risk side too');
  assert.match(r.against.points[1].reply.text, /868\.98/);
});

test('without a scripted case a clean file is still "no contest"', async () => {
  const def = { applicantName: 'Nobody Special', ssnLast4: '1111', productType: 'personal-loan', requiredDocTypes: [] };
  const r = await runCourtroom({ application: def, documents: [], assessment: { parameters: [] }, generate: null, log: quiet });
  assert.equal(r.eligible, false);
});

test('the hearing opens with the risk reviewer, alternates, and keeps every risk-side point', () => {
  const pt = (t, side) => ({ text: t, cites: [], origin: 'rule', reply: side === 'for' ? { text: 'r', cites: [] } : null });
  const against = { points: [pt('a1'), pt('a2'), pt('a3'), pt('a4'), pt('a5'), pt('a6'), pt('a7')] };
  const forSide = { points: [pt('f1', 'for'), pt('f2', 'for'), pt('f3', 'for'), pt('f4', 'for'), pt('f5', 'for'), pt('f6', 'for')] };
  const d = buildDebate(against, forSide);
  assert.deepEqual(d.slice(0, 4).map((t) => t.side), ['against', 'for', 'against', 'for']);
  assert.equal(d.filter((t) => t.side === 'against').length, 7, 'no risk-side flag is dropped');
  assert.equal(d.filter((t) => t.side === 'for').length, 4, 'the advocate is capped');
  assert.equal(d.find((t) => t.side === 'for').reply.side, 'against');
});
