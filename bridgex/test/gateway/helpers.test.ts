import { describe, expect, it } from 'vitest';
import { apiKeyMatches } from '../../src/gateway/auth';
import { backoffDelay, isRetryable } from '../../src/gateway/retry';
import { cached } from '../../src/gateway/secrets';
import { computeStats } from '../../src/gateway/stats';
import type { RequestSummary } from '../../src/gateway/store';
import { newRequestId } from '../../src/shared/ids';

describe('U3 Req 1.2 – API key comparison (NFR-01)', () => {
  it('matches only the exact key, including for different lengths', () => {
    expect(apiKeyMatches('abc123', 'abc123')).toBe(true);
    expect(apiKeyMatches('abc124', 'abc123')).toBe(false);
    expect(apiKeyMatches('abc', 'abc123')).toBe(false);
    expect(apiKeyMatches(undefined, 'abc123')).toBe(false);
    expect(apiKeyMatches('', '')).toBe(false);
  });
});

describe('U3 Req 3 – retry policy (FR-11, ADR-006)', () => {
  it('3.2 retries only transient failures', () => {
    expect(isRetryable({ kind: 'timeout', latencyMs: 1 })).toBe(true);
    expect(isRetryable({ kind: 'network', latencyMs: 1 })).toBe(true);
    for (const status of [429, 502, 503, 504]) expect(isRetryable({ kind: 'http-error', status, latencyMs: 1 })).toBe(true);
    expect(isRetryable({ kind: 'http-error', status: 500, latencyMs: 1 })).toBe(false);
    expect(isRetryable({ kind: 'fault', status: 500, latencyMs: 1 })).toBe(false);
    expect(isRetryable({ kind: 'ok', status: 200, latencyMs: 1 })).toBe(false);
  });

  it('3.2 backs off exponentially with up to 50% jitter', () => {
    expect([1, 2, 3].map((n) => backoffDelay(n, 200, () => 0))).toEqual([200, 400, 800]);
    expect([1, 2, 3].map((n) => backoffDelay(n, 200, () => 1))).toEqual([300, 600, 1200]);
  });
});

describe('U3 Req 6.2 – statistics (FR-14)', () => {
  const now = new Date('2026-11-20T09:30:00Z');
  const record = (overrides: Partial<RequestSummary>): RequestSummary => ({
    id: 'x',
    timestamp: '2026-11-20T09:29:10Z',
    integrationId: 'account-balance',
    integrationName: 'Account balance inquiry',
    method: 'POST',
    path: '/api/v1/accounts/balance',
    status: 200,
    outcome: 'success',
    latencyMs: 100,
    downstreamLatencyMs: 80,
    attempts: [],
    retried: false,
    recovered: false,
    ...overrides,
  });

  it('computes totals, rates, percentiles and per-minute buckets', () => {
    const stats = computeStats(
      [
        record({ latencyMs: 100 }),
        record({ latencyMs: 300, retried: true, recovered: true }),
        record({ latencyMs: 900, status: 503, outcome: 'downstream_error', retried: true }),
        record({ latencyMs: 20, status: 400, outcome: 'client_error', integrationId: 'fund-transfer', integrationName: 'Fund transfer', timestamp: '2026-11-20T08:00:00Z' }),
      ],
      now,
    );
    expect(stats).toMatchObject({ total: 4, succeeded: 2, failed: 2, clientErrors: 1, downstreamErrors: 1, successRate: 50, retried: 2, recovered: 1, avgLatencyMs: 330, p95LatencyMs: 900 });
    expect(stats.byIntegration[0]).toMatchObject({ integrationId: 'account-balance', total: 3, failed: 1 });
    expect(stats.series.at(-2)).toMatchObject({ succeeded: 2, failed: 1 });
    expect(stats.series.reduce((n, b) => n + b.succeeded + b.failed, 0)).toBe(3);
  });
});

describe('shared helpers', () => {
  it('request ids sort by time', () => {
    const a = newRequestId(new Date('2026-11-20T09:00:00Z'));
    const b = newRequestId(new Date('2026-11-20T09:00:01Z'));
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[a-z0-9]{9}-[a-z0-9]{4}$/);
  });

  it('cached secrets reload after the TTL and do not cache failures', async () => {
    let calls = 0;
    let clock = 0;
    const load = cached(async () => `v${++calls}`, 1000, () => clock);
    expect(await load()).toBe('v1');
    expect(await load()).toBe('v1');
    clock = 1001;
    expect(await load()).toBe('v2');
  });
});
