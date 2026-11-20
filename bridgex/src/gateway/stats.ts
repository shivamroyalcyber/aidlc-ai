import type { RequestSummary } from './store';

export interface IntegrationStats {
  integrationId: string;
  integrationName: string;
  total: number;
  failed: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  retried: number;
}

export interface Stats {
  total: number;
  succeeded: number;
  failed: number;
  clientErrors: number;
  downstreamErrors: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  retried: number;
  recovered: number;
  byIntegration: IntegrationStats[];
  /** Last 30 minutes, one entry per minute, oldest first. */
  series: Array<{ minute: string; succeeded: number; failed: number }>;
  windowSize: number;
}

const isSuccess = (r: RequestSummary) => r.outcome === 'success' || r.outcome === 'replayed';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const average = (values: number[]) => (values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

export function computeStats(records: RequestSummary[], now: Date): Stats {
  const latencies = records.map((r) => r.latencyMs);
  const succeeded = records.filter(isSuccess).length;

  const groups = new Map<string, RequestSummary[]>();
  for (const record of records) {
    const id = record.integrationId ?? 'unmatched';
    groups.set(id, [...(groups.get(id) ?? []), record]);
  }
  const byIntegration = [...groups.entries()]
    .map(([integrationId, items]) => ({
      integrationId,
      integrationName: items[0]?.integrationName ?? 'Unmatched route',
      total: items.length,
      failed: items.filter((r) => !isSuccess(r)).length,
      avgLatencyMs: average(items.map((r) => r.latencyMs)),
      p95LatencyMs: percentile(items.map((r) => r.latencyMs), 95),
      retried: items.filter((r) => r.retried).length,
    }))
    .sort((a, b) => b.total - a.total);

  const minuteMs = 60_000;
  const end = Math.floor(now.getTime() / minuteMs) * minuteMs;
  const series = Array.from({ length: 30 }, (_, i) => ({ minute: new Date(end - (29 - i) * minuteMs).toISOString(), succeeded: 0, failed: 0 }));
  for (const record of records) {
    const index = 29 - Math.floor((end - Math.floor(Date.parse(record.timestamp) / minuteMs) * minuteMs) / minuteMs);
    const bucket = series[index];
    if (bucket) {
      if (isSuccess(record)) bucket.succeeded += 1;
      else bucket.failed += 1;
    }
  }

  return {
    total: records.length,
    succeeded,
    failed: records.length - succeeded,
    clientErrors: records.filter((r) => r.outcome === 'client_error').length,
    downstreamErrors: records.filter((r) => r.outcome === 'downstream_error' || r.outcome === 'downstream_fault').length,
    successRate: records.length === 0 ? 0 : Math.round((succeeded / records.length) * 1000) / 10,
    avgLatencyMs: average(latencies),
    p95LatencyMs: percentile(latencies, 95),
    retried: records.filter((r) => r.retried).length,
    recovered: records.filter((r) => r.recovered).length,
    byIntegration,
    series,
    windowSize: records.length,
  };
}
