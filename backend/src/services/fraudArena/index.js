import { ATTACKS } from './attacks.js';
import { mulberry32, planRun, runAttack, runMany } from './runner.js';
import { summarize } from './scoreboard.js';

export { ATTACKS, runMany, summarize };

export const MAX_RUNS = 1000;

// One scoreboard held in memory for the live page. It is lost on redeploy, like the answer-quality run.
export function createArena({ seed = 1 } = {}) {
  let currentSeed = seed;
  let rng = mulberry32(currentSeed);
  let results = [];
  const api = {
    get seed() { return currentSeed; },
    reset(newSeed = currentSeed) {
      currentSeed = newSeed;
      rng = mulberry32(currentSeed);
      results = [];
    },
    next() {
      const { attack, base } = planRun(results.length, rng);
      const result = { n: results.length + 1, ...runAttack(attack, base, rng) };
      results.push(result);
      return result;
    },
    batch(count) {
      const out = [];
      for (let i = 0; i < Math.min(count, MAX_RUNS); i += 1) out.push(api.next());
      return out;
    },
    report: ({ feed = 15 } = {}) => ({ seed: currentSeed, ...summarize(results), recent: results.slice(-feed).reverse() }),
    results: () => results,
  };
  return api;
}
