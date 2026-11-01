import { CircuitOpenError } from './circuitBreaker.js';

// Tries each chat provider in order, each behind its own circuit breaker. The first one that
// answers wins; a provider that is down (or whose circuit is open) is skipped. If every provider
// fails, AllProvidersFailedError tells the caller to fall back to a degraded answer.
export class AllProvidersFailedError extends Error {
  constructor(failures) {
    super('No chat provider could answer: ' + failures.map((f) => `${f.name}: ${f.message}`).join('; '));
    this.name = 'AllProvidersFailedError';
    this.failures = failures;
  }
}

// providers: [{ name, breaker, call(messages, signal) }]. Resolves { text, provider }.
export function createFailover(providers) {
  return async function generate(messages, signal) {
    const failures = [];
    for (const { name, breaker, call } of providers) {
      try {
        const text = await breaker.run(() => call(messages, signal));
        return { text, provider: name };
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error; // the client left; stop
        failures.push({ name, message: error instanceof CircuitOpenError ? 'circuit open' : error.message });
      }
    }
    throw new AllProvidersFailedError(failures);
  };
}
