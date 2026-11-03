import { findDuplicateMatches } from '../duplicateCheck.js';
import { ATTACKS, ATTACKS_BY_ID } from './attacks.js';
import { cleanBases, flagsFor, loadPersona } from './bases.js';

// Seeded random numbers, so the same seed always produces the same run (plan FA-03, FA-06).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const outcomeOf = (attack, flagged) => {
  if (attack.expected === 'clean') return flagged ? 'false-alarm' : 'clean';
  return flagged ? 'caught' : 'missed';
};

// Apply one attack to a copy of a clean base and run the real checks on the result. Nothing is stored.
export function runAttack(attack, base, rng) {
  const started = performance.now();
  const clone = structuredClone({ application: base.application, docs: base.docs });
  clone.changes = [];
  clone.others = [];
  attack.apply(clone, rng);
  const { fired, duplicates } = flagsFor(clone, findDuplicateMatches);
  const flagged = fired.length > 0 || duplicates.length > 0;
  const outcome = outcomeOf(attack, flagged);
  const expectedOutcome = { caught: 'caught', miss: 'missed', clean: 'clean' }[attack.expected]; // 'partial' has no single expectation
  return {
    attackId: attack.id,
    label: attack.label,
    group: attack.group,
    note: attack.note,
    base: base.name,
    expected: attack.expected,
    outcome,
    surprise: expectedOutcome !== undefined && outcome !== expectedOutcome,
    changes: clone.changes,
    fired: [
      ...fired,
      ...duplicates.map((d) => ({ doc: 'application', field: 'Duplicate identity', status: d.kind })),
    ],
    ms: Math.round((performance.now() - started) * 10) / 10,
  };
}

// The attack and base for the n-th run of a seed: attacks in turn, bases chosen at random.
export function planRun(index, rng, { attackIds } = {}) {
  const attacks = attackIds?.length ? attackIds.map((id) => ATTACKS_BY_ID[id]).filter(Boolean) : ATTACKS;
  const attack = attacks[index % attacks.length];
  const bases = cleanBases(findDuplicateMatches);
  const base = attack.useBase ? loadPersona(attack.useBase) : bases[Math.floor(rng() * bases.length)];
  return { attack, base };
}

export function runMany({ runs = 100, seed = 1, attackIds } = {}) {
  const rng = mulberry32(seed);
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    const { attack, base } = planRun(i, rng, { attackIds });
    results.push({ n: i + 1, ...runAttack(attack, base, rng) });
  }
  return results;
}
