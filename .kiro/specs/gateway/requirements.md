# Requirements Document: U3 Gateway

## Introduction
The gateway receives client requests, authenticates them, runs the transformation engine (U1), calls the downstream system with retries, and records everything for monitoring. It also serves the admin API used by the dashboard. Source requirements: FR-08 to FR-16, NFR-01 to NFR-04, NFR-07.

## Glossary
- **Pipeline**: The ordered steps for one integration request.
- **Request_Record**: The stored, masked record of one request (summary, attempts, four stages).
- **Attempt**: One downstream HTTP call.
- **Idempotency_Record**: Stored result for an `Idempotency-Key` on one integration.

## Requirements

### Requirement 1: Authentication and routing
**User Story:** As a security owner, I want every call authenticated. (FR-09)
#### Acceptance Criteria
1. WHEN `x-api-key` is missing or wrong on any route except `GET /health` THEN the gateway SHALL return HTTP 401 `UNAUTHORIZED` and make no downstream call.
2. The gateway SHALL compare API keys in constant time.
3. WHEN no Integration matches the method, path and SOAP operation THEN the gateway SHALL return HTTP 404 `ROUTE_NOT_FOUND`.
4. WHEN the HTTP method is `OPTIONS` THEN API Gateway CORS SHALL answer it (no Lambda logic).

### Requirement 2: Pipeline
**User Story:** As an app developer, I want my request transformed and answered in my own format. (FR-01–FR-04, FR-07, FR-08)
#### Acceptance Criteria
1. The Pipeline SHALL reject bodies over 64 KB with 413 and unparsable bodies with 400 `INVALID_PAYLOAD`.
2. The Pipeline SHALL validate the body and return 400 `VALIDATION_FAILED` with details before any downstream call.
3. WHEN the target is SOAP with `auth: ws-security` THEN the Pipeline SHALL add a UsernameToken from the downstream credentials; WHEN the target is REST with `auth: bearer` THEN it SHALL add `Authorization: Bearer`.
4. WHEN the downstream returns a SOAP fault THEN the Pipeline SHALL map its `ErrorCode` through the Integration's `faults` (default 502 `DOWNSTREAM_FAULT`) and SHALL NOT retry.
5. WHEN the downstream returns a REST 4xx for a `soap-to-rest` Integration THEN the Pipeline SHALL return a SOAP fault with the REST error code.
6. Errors for `soap-to-rest` Integrations SHALL be SOAP faults; errors for `rest-to-soap` Integrations SHALL use the JSON error model.
7. Every response SHALL include `x-bridgex-request-id`; integration responses SHALL include `x-bridgex-attempts` and `x-bridgex-latency-ms`.

### Requirement 3: Timeouts and retries
**User Story:** As an operations engineer, I want brief outages absorbed. (FR-11, NFR-03)
#### Acceptance Criteria
1. Each Attempt SHALL be aborted after the Integration's `timeoutMs` (default 2500 ms).
2. WHEN the Integration is idempotent and an Attempt fails with timeout, network error, 429, 502, 503 or 504 THEN the Pipeline SHALL retry up to `retry.maxAttempts` (default 3) with exponential backoff and jitter.
3. WHEN the Integration is not idempotent THEN the Pipeline SHALL make exactly one Attempt.
4. WHEN all Attempts fail THEN the Pipeline SHALL return 504 `DOWNSTREAM_TIMEOUT` if the last failure was a timeout, else 503 `DOWNSTREAM_UNAVAILABLE`.

### Requirement 4: Idempotency
**User Story:** As a customer, I never want to be charged twice. (FR-12)
#### Acceptance Criteria
1. WHEN `requireIdempotencyKey` is true and the header `Idempotency-Key` is missing THEN the gateway SHALL return 400 `IDEMPOTENCY_KEY_REQUIRED`.
2. WHEN a key is reused with the same body after completion THEN the gateway SHALL return the stored status and body with `x-idempotent-replay: true` and SHALL NOT call the downstream.
3. WHEN a key is reused with a different body, or while the first call is still in progress, THEN the gateway SHALL return 409 `IDEMPOTENCY_CONFLICT`.
4. WHEN the first call ends in a client error (4xx before the downstream call) THEN the key SHALL be released.

### Requirement 5: Request log and metrics
**User Story:** As an operations engineer, I want each request recorded. (FR-13, NFR-04)
#### Acceptance Criteria
1. The gateway SHALL store a Request_Record for every integration request, including rejected ones, with id, time, integration, direction, status, outcome, latency, Attempts and the four stages.
2. Before storing, the gateway SHALL mask sensitive values and SHALL replace downstream credentials and the client API key with `********`.
3. Each stage text SHALL be truncated to 8 KB.
4. The gateway SHALL write one structured log line per request in CloudWatch Embedded Metric Format with `Requests`, `Failures`, `Retries` and `LatencyMs`, dimension `Integration`.
5. A failure to store a record SHALL NOT fail the client request.

### Requirement 6: Admin API
**User Story:** As an operator, I want data for the dashboard. (FR-14–FR-16)
#### Acceptance Criteria
1. `GET /admin/integrations` SHALL return the public view of every Integration.
2. `GET /admin/stats` SHALL return totals, successes, failures, success rate, average and p95 latency, retried and recovered counts, per-integration figures and a per-minute series for the last 30 minutes, from the latest 500 records.
3. `GET /admin/requests` SHALL return up to `limit` (default 50, max 200) summaries, newest first; `GET /admin/requests/{id}` SHALL return one full record or 404.
4. `POST /admin/transform-preview` SHALL run U1 `previewTransform` and return its result without any downstream call.
5. `GET /admin/chaos` and `POST /admin/chaos` SHALL read and set failure injection for `core-banking` or `fintech` (`mode` `error`, `timeout` or `off`, `count` 0–10).

### Requirement 7: Local run
**User Story:** As a presenter, I want a Plan B without AWS. (NFR-07)
#### Acceptance Criteria
1. `npm run local` SHALL serve the gateway, the simulators and the dashboard on one port with in-memory stores.
