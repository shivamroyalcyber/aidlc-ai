export type AttemptKind = 'ok' | 'fault' | 'http-error' | 'timeout' | 'network';

export interface Attempt {
  kind: AttemptKind;
  status?: number;
  body?: string;
  latencyMs: number;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Transient failures only. A SOAP fault or a REST 4xx is a business answer and is never retried (ADR-006). */
export function isRetryable(attempt: Attempt): boolean {
  if (attempt.kind === 'timeout' || attempt.kind === 'network') return true;
  return attempt.kind === 'http-error' && attempt.status !== undefined && RETRYABLE_STATUS.has(attempt.status);
}

/** Exponential backoff with up to 50% jitter. `attempt` is the 1-based number of the attempt that just failed. */
export function backoffDelay(attempt: number, baseDelayMs: number, random: () => number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  return Math.round(exponential + exponential * 0.5 * random());
}
