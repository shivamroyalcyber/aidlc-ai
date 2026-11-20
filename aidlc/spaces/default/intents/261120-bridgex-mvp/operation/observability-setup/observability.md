# Observability Setup (Stage 4.4)

| Signal | Where | Detail |
|---|---|---|
| Request log | DynamoDB `pk=REQ`, 7-day TTL | Four masked stages, attempts, latency, outcome per request. Served by `/admin/requests` |
| Live KPIs | BridgeX dashboard → Overview | Totals, success rate, failures by side, avg and p95 latency, retried, recovered, per-integration table, 30-minute chart |
| Metrics | CloudWatch namespace `BridgeX`, dimension `Integration` | `Requests`, `Failures` (5xx), `Retries`, `LatencyMs`, `DownstreamLatencyMs` from Embedded Metric Format log lines. 20 metric streams present at 09:40Z |
| Dashboard | CloudWatch `BridgeX-Operations` | Requests, failures, retries per minute; p95 latency and downstream latency; Lambda errors and duration; failures in the last 5 minutes |
| Alarm | `DownstreamFailuresAlarm` | More than 5 server-side failures in 5 minutes. `fail next 5 calls` twice in the demo will trip it |
| Logs | `/aws/lambda/...Gateway...`, `...Simulators...`, 1-week retention | One JSON line per request; no payloads, no secrets |

## Runbook: "Core banking is failing"
1. Overview shows the failure count rising and `downstream` failures. Open a failed request: attempts show `http-error 503` ×3 or `timeout`.
2. Idempotent calls (balance, history, credit score) retry automatically; a brief outage shows as **Recovered**.
3. Transfers do not retry. A `DOWNSTREAM_TIMEOUT` on a transfer means the result is unknown: reconcile with the core before the customer retries with a **new** key.
4. Clear injected failures with **Clear** in the Playground (or `POST /admin/chaos {"mode":"off"}`).
