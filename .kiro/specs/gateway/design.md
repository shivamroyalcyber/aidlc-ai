# Design: U3 Gateway

Decisions: ADR-001, ADR-005, ADR-006, ADR-007. NFR measures: `construction/nfr-requirements/nfr-design.md`.

## Modules (`bridgex/src/gateway/`)
| Module | Responsibility |
|---|---|
| `app.ts` | `createGatewayApp(deps)` → `(HttpRequest) => HttpResponse`. Health, auth, admin routes, integration routes |
| `pipeline.ts` | `runIntegration(deps, integration, req, requestId)`; the steps below |
| `retry.ts` | `isRetryable(outcome)`, `backoffDelay(attempt, base, random)` |
| `http-client.ts` | `fetchWithTimeout(url, init, timeoutMs)` → `{status, body, latencyMs}` or `{error: 'timeout'\|'network'}` |
| `auth.ts` | `apiKeyMatches(given, expected)` with SHA-256 + `timingSafeEqual` |
| `store.ts` | `RequestLogStore`, `IdempotencyStore` interfaces, in-memory implementations |
| `dynamo-store.ts` | DynamoDB implementations (single table, ADR-005) |
| `stats.ts` | `computeStats(records, now)` |
| `metrics.ts` | `emfLine(record)` |
| `secrets.ts` | `cachedSecrets(loader, ttlMs)` and the Secrets Manager loader |
| `ids.ts` (shared) | `newRequestId(now, random)`: 9-char base36 time + 4 random chars, sortable |
| `lambda.ts` | API Gateway v2 adapter wiring real dependencies |

## Pipeline steps
1. Size check → parse via U1 `transformRequest` (parse, validate, map, build).
2. Idempotency (if `requireIdempotencyKey`): `begin(integrationId, key, sha256(body))` → `new` / `replay(stored)` / `conflict`.
3. Attach downstream credentials (UsernameToken XML header or Bearer header).
4. Attempt loop: `fetchWithTimeout`; classify `ok`, `fault` (SOAP fault body), `http-error` (status), `timeout`, `network`; retry only if idempotent and retryable; `sleep(backoffDelay)` between attempts.
5. `transformResponse`, or build the error response for the Integration's direction.
6. Idempotency `complete(key, status, body)` for downstream results, `release(key)` for client-side errors.
7. Build the masked Request_Record, `log.put` (errors swallowed and logged), print the EMF line.

## Dependencies (injected)
```ts
interface GatewayDeps {
  registry; apiKey(): Promise<string>; downstreamCredentials(): Promise<DownstreamCredentials>;
  log: RequestLogStore; idempotency: IdempotencyStore; chaos: ChaosStore;
  fetch: typeof fetch; sleep(ms); now(): Date; random(): number;
  suggestMappings?: (input) => Promise<SuggestionResult>;  // U6
  emit(line: string): void;                                // console.log in Lambda
}
```

## DynamoDB items
| Item | pk | sk | Other | TTL |
|---|---|---|---|---|
| Request_Record | `REQ` | request id | full record | 7 days |
| Idempotency_Record | `IDEM#<integration>#<key>` | `IDEM` | `state`, `bodyHash`, `status`, `body`, `contentType` | 24 h |
| Chaos | `CHAOS` | target | `mode`, `remaining` | none |

## Testing strategy
`test/gateway/pipeline.test.ts` drives `createGatewayApp` with the in-process simulators (U2) as the `fetch` implementation, so the whole flow is tested without a network: success paths for all four integrations, auth failure, validation failure, fault mapping, retry recovery, retry exhaustion, timeout, no retry for transfers, idempotent replay and conflict, masking. `retry.test.ts` and `stats.test.ts` cover the helpers.
