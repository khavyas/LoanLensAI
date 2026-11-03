// Scoring for the Fraud Arena (plan FA-05).

// Wilson 95% interval for a proportion, so a small run is not over-claimed.
export function wilson(successes, n, z = 1.96) {
  if (!n) return { low: 0, high: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, (centre - margin) / denom), high: Math.min(1, (centre + margin) / denom) };
}

const rate = (hit, n) => (n ? hit / n : null);
const round = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

export function summarize(results) {
  const attacks = results.filter((r) => r.expected !== 'clean');
  const controls = results.filter((r) => r.expected === 'clean');
  const caught = attacks.filter((r) => r.outcome === 'caught').length;
  const designed = attacks.filter((r) => r.expected === 'caught');
  const designedCaught = designed.filter((r) => r.outcome === 'caught').length;
  const limits = attacks.filter((r) => r.expected === 'miss');
  const borderline = attacks.filter((r) => r.expected === 'partial');
  const falseAlarms = controls.filter((r) => r.outcome === 'false-alarm').length;

  const byAttack = {};
  for (const r of results) {
    const row = (byAttack[r.attackId] ||= { attackId: r.attackId, label: r.label, group: r.group, expected: r.expected, runs: 0, caught: 0, missed: 0, falseAlarms: 0, surprises: 0 });
    row.runs += 1;
    if (r.outcome === 'caught') row.caught += 1;
    if (r.outcome === 'missed') row.missed += 1;
    if (r.outcome === 'false-alarm') row.falseAlarms += 1;
    if (r.surprise) row.surprises += 1;
  }
  const rows = Object.values(byAttack).map((row) => ({
    ...row,
    detectionRate: row.expected === 'clean' ? null : round(rate(row.caught, row.runs)),
  }));

  const interval = wilson(caught, attacks.length);
  return {
    runs: results.length,
    attacks: attacks.length,
    controls: controls.length,
    caught,
    missed: attacks.length - caught,
    detectionRate: round(rate(caught, attacks.length)),
    detectionInterval: { low: round(interval.low), high: round(interval.high) },
    // Attacks the checks are built to catch: this is the number a regression would lower.
    designedDetectionRate: round(rate(designedCaught, designed.length)),
    // Attacks we know the checks cannot catch: reported openly, not hidden in the average.
    knownLimitMissRate: round(rate(limits.filter((r) => r.outcome === 'missed').length, limits.length)),
    // Edits whose outcome depends on their size: the rate shows where the threshold bites.
    borderlineDetectionRate: round(rate(borderline.filter((r) => r.outcome === 'caught').length, borderline.length)),
    falseAlarms,
    falseAlarmRate: round(rate(falseAlarms, controls.length)),
    surprises: results.filter((r) => r.surprise).length,
    byAttack: rows,
  };
}
