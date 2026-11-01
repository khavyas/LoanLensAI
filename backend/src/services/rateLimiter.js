// Sliding-window limiter keyed by user (in memory: one instance per server process).
export function createRateLimiter({ limit = 20, windowMs = 60000, now = Date.now } = {}) {
  const hits = new Map();
  return {
    // Returns { allowed, retryAfterSec }.
    check(key) {
      const t = now();
      const recent = (hits.get(key) || []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}
