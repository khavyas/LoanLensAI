import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ATTACKS, createArena, runMany, summarize } from '../../src/services/fraudArena/index.js';
import { cleanBases } from '../../src/services/fraudArena/bases.js';
import { findDuplicateMatches } from '../../src/services/duplicateCheck.js';
import { wilson } from '../../src/services/fraudArena/scoreboard.js';

const SEEDS = [1, 2, 3, 7, 42, 99];

test('the same seed gives the same run, a different seed gives a different one', () => {
  const strip = (rs) => rs.map(({ ms, ...rest }) => rest);
  assert.deepEqual(strip(runMany({ runs: 60, seed: 5 })), strip(runMany({ runs: 60, seed: 5 })));
  assert.notDeepEqual(strip(runMany({ runs: 60, seed: 5 })), strip(runMany({ runs: 60, seed: 6 })));
});

test('clean controls never raise a flag (false alarms 0)', () => {
  for (const seed of SEEDS) {
    const controls = runMany({ runs: ATTACKS.length * 8, seed }).filter((r) => r.expected === 'clean');
    assert.ok(controls.length >= 8);
    assert.ok(controls.every((r) => r.outcome === 'clean' && r.fired.length === 0), `seed ${seed}`);
  }
});

test('every attack the checks are built to catch is caught, whichever applicant it is applied to', () => {
  for (const seed of SEEDS) {
    for (const r of runMany({ runs: ATTACKS.length * 12, seed }).filter((x) => x.expected === 'caught')) {
      assert.equal(r.outcome, 'caught', `${r.attackId} on ${r.base} (seed ${seed}) slipped through: ${JSON.stringify(r.changes)}`);
      assert.ok(r.fired.length > 0);
    }
  }
});

test('the known limits really are misses, so a surprise improvement is noticed', () => {
  const limits = runMany({ runs: ATTACKS.length * 12, seed: 3 }).filter((x) => x.expected === 'miss');
  assert.ok(limits.length >= 30);
  assert.ok(limits.every((r) => r.outcome === 'missed'), 'a known limit was caught: update the catalogue and the claims');
});

test('the borderline edit is caught when large and missed when small', () => {
  const runs = runMany({ runs: ATTACKS.length * 40, seed: 11, attackIds: ['stub-moderate-rescale'] });
  assert.ok(runs.some((r) => r.outcome === 'caught') && runs.some((r) => r.outcome === 'missed'));
  assert.equal(runs.some((r) => r.surprise), false, 'a borderline attack has no single expectation');
});

test('a forged file is flagged for the reason the catalogue gives', () => {
  const one = (id) => runMany({ runs: 1, seed: 4, attackIds: [id] })[0];
  assert.ok(one('license-dob').fired.some((f) => f.field === 'Date of birth' && f.status === 'mismatch'));
  assert.ok(one('stub-consistent-rescale').fired.some((f) => /Bank deposit vs/.test(f.field)));
  assert.ok(one('stub-matches-claim').fired.some((f) => /withholding/.test(f.field)));
  assert.ok(one('identity-reuse').fired.some((f) => f.field === 'Duplicate identity'));
  assert.ok(one('wrong-document').fired.some((f) => f.field === 'Document type'));
});

test('the arena changes nothing: base data is intact and no database is touched', () => {
  const snapshot = JSON.stringify(cleanBases(findDuplicateMatches));
  runMany({ runs: ATTACKS.length * 6, seed: 8 });
  assert.equal(JSON.stringify(cleanBases(findDuplicateMatches)), snapshot);
  assert.equal(mongoose.connection.readyState, 0, 'no database connection was opened');
});

test('the live scoreboard follows a fixed seed, resets, and caps a batch', () => {
  const arena = createArena({ seed: 9 });
  const first = arena.batch(20).map((r) => r.attackId);
  arena.reset(9);
  assert.deepEqual(arena.batch(20).map((r) => r.attackId), first);
  assert.equal(arena.report().runs, 20);
  assert.equal(arena.report({ feed: 5 }).recent.length, 5);
  arena.reset(1);
  assert.equal(arena.report().runs, 0);
  assert.equal(arena.batch(10_000).length, 1000);
});

test('summary separates designed catches, known limits and false alarms', () => {
  const s = summarize(runMany({ runs: ATTACKS.length * 10, seed: 2 }));
  assert.equal(s.designedDetectionRate, 1);
  assert.equal(s.knownLimitMissRate, 1);
  assert.equal(s.falseAlarmRate, 0);
  assert.equal(s.surprises, 0);
  assert.ok(s.borderlineDetectionRate > 0 && s.borderlineDetectionRate < 1);
  assert.ok(s.detectionInterval.low < s.detectionRate && s.detectionRate < s.detectionInterval.high);
  assert.ok(s.byAttack.length === ATTACKS.length);
});

test('wilson interval is wide for few runs and narrow for many', () => {
  const small = wilson(9, 10);
  const large = wilson(900, 1000);
  assert.ok(small.high - small.low > large.high - large.low);
  assert.deepEqual(wilson(0, 0), { low: 0, high: 0 });
});
