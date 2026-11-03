import { runMany, summarize } from '../services/fraudArena/index.js';

// Command-line Fraud Arena: npm run arena -- --runs 200 --seed 7
// Prints the scoreboard as JSON. Exits 1 if a check regressed: a built-to-catch attack slipped
// through, a genuine file was flagged, or a known limit is no longer a miss (the catalogue is stale).
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};

const runs = Math.min(arg('runs', 200), 1000);
const seed = arg('seed', 1);
const results = runMany({ runs, seed });
const summary = summarize(results);
console.log(JSON.stringify({ seed, ...summary }, null, 2));

const problems = results.filter((r) => r.surprise).map((r) => `${r.attackId} on ${r.base}: expected ${r.expected}, got ${r.outcome}`);
if (problems.length) {
  console.error(`\n${problems.length} surprise(s):\n- ${[...new Set(problems)].join('\n- ')}`);
  process.exit(1);
}
