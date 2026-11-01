// Stops hammering a provider that is down. After `threshold` consecutive failures the circuit
// opens for `cooldownMs`: calls fail at once (no 120 s timeout per question) until the cooldown
// ends, then one trial call is let through. A success closes the circuit again.
export class CircuitOpenError extends Error {
  constructor(name, retryInMs) {
    super(`${name} is temporarily unavailable (circuit open)`);
    this.name = 'CircuitOpenError';
    this.retryInMs = retryInMs;
  }
}

export function createCircuitBreaker({ name = 'provider', threshold = 3, cooldownMs = 30000, now = Date.now } = {}) {
  let failures = 0;
  let openedAt = null;
  return {
    async run(fn) {
      if (openedAt !== null) {
        const elapsed = now() - openedAt;
        if (elapsed < cooldownMs) throw new CircuitOpenError(name, cooldownMs - elapsed);
        openedAt = null; // cooldown over: half-open, allow one trial call
        failures = threshold - 1; // so a single failed trial re-opens immediately
      }
      try {
        const result = await fn();
        failures = 0;
        return result;
      } catch (error) {
        // A client who disconnected is not a provider failure.
        if (error?.name !== 'AbortError') {
          failures += 1;
          if (failures >= threshold) openedAt = now();
        }
        throw error;
      }
    },
    state: () => (openedAt === null ? 'closed' : now() - openedAt < cooldownMs ? 'open' : 'half-open'),
  };
}
