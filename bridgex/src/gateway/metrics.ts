import type { RequestRecord } from './store';

export const METRICS_NAMESPACE = 'BridgeX';

/** One CloudWatch Embedded Metric Format line per integration request (NFR-04). Contains no payloads. */
export function emfLine(record: RequestRecord): string {
  return JSON.stringify({
    _aws: {
      Timestamp: Date.parse(record.timestamp),
      CloudWatchMetrics: [
        {
          Namespace: METRICS_NAMESPACE,
          Dimensions: [['Integration']],
          Metrics: [
            { Name: 'Requests', Unit: 'Count' },
            { Name: 'Failures', Unit: 'Count' },
            { Name: 'Retries', Unit: 'Count' },
            { Name: 'LatencyMs', Unit: 'Milliseconds' },
            { Name: 'DownstreamLatencyMs', Unit: 'Milliseconds' },
          ],
        },
      ],
    },
    Integration: record.integrationId ?? 'unmatched',
    Requests: 1,
    Failures: record.status >= 500 ? 1 : 0,
    Retries: Math.max(0, record.attempts.length - 1),
    LatencyMs: record.latencyMs,
    DownstreamLatencyMs: record.downstreamLatencyMs,
    level: 'info',
    message: 'request completed',
    requestId: record.id,
    status: record.status,
    outcome: record.outcome,
    errorCode: record.errorCode,
  });
}
