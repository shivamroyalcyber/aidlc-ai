# Architecture Decision Records

**Stage**: 2.6 Domain Design. Status of all ADRs: Accepted (2026-11-20), under the person's delegated approval.

## ADR-001 Serverless gateway on Lambda behind API Gateway HTTP API
- **Context**: 3-hour timebox, demo account, bursty demo traffic.
- **Decision**: One gateway Lambda (Node.js 22, arm64) behind an HTTP API. A second Lambda and HTTP API host the simulated systems.
- **Alternatives**: ECS Fargate (slower to set up, always-on cost); API Gateway REST API mapping templates (no SOAP envelope support).
- **Consequences**: Pay per request, no servers. The 30 s HTTP API timeout bounds retries, which NFR-03 already does.

## ADR-002 Integrations are JSON documents in git, bundled with the Lambda
- **Context**: Mappings must change without code changes (NFR-06) and be reviewable.
- **Decision**: One file per integration in `src/config/integrations/`, validated at load and by tests, bundled at deploy.
- **Alternatives**: Store configs in DynamoDB with an editor UI (more work, no review trail).
- **Consequences**: A mapping change goes through review and a deploy, which a bank would require anyway. A runtime config store is a later step.

## ADR-003 `fast-xml-parser` instead of a SOAP client library
- **Context**: The proposal suggests `strong-soap`. The demo has no WSDL, and the gateway must control the envelope, header and fault handling.
- **Decision**: Build and parse SOAP 1.1 envelopes with `fast-xml-parser`, with namespace prefixes removed on parse.
- **Consequences**: Small bundle and full control. WSDL discovery stays a future enhancement.

## ADR-004 SOAP 1.1 document/literal only
- **Decision**: Support SOAP 1.1 envelopes, `SOAPAction`, and `soap:Fault` with `detail`. SOAP 1.2, MTOM and WS-Security signatures are out of scope.

## ADR-005 DynamoDB single table
- **Context**: Q2 was delegated. Data is request logs, idempotency records and chaos control, all key-value with TTL.
- **Decision**: One on-demand table with `pk`, `sk` and `ttl`. Request IDs are time-ordered, so `pk = REQ` queried in reverse gives recent requests.
- **Alternatives**: PostgreSQL on RDS (VPC, connection management, minutes to provision).
- **Consequences**: A single `REQ` partition is fine at demo scale; production would shard by day.

## ADR-006 Retry only idempotent operations; idempotency keys for transfers
- **Decision**: Retries apply only when the integration sets `idempotent: true`, and only on timeout, network error, 429, 502, 503 or 504. Transfers need an `Idempotency-Key` and are never retried by the gateway.
- **Consequences**: A timed-out transfer is reported as unknown (`DOWNSTREAM_TIMEOUT`) rather than risking a double debit.

## ADR-007 API key in Secrets Manager; dashboard asks for it at runtime
- **Decision**: CDK generates the client API key and the downstream credentials in Secrets Manager. The static dashboard keeps the key in `sessionStorage` only.
- **Alternatives**: Cognito (better for production, too much setup for today).

## ADR-008 Bedrock tool use for mapping suggestions, human applies them
- **Decision**: Call Claude Haiku 4.5 through the Converse API with a forced `propose_mappings` tool schema. Check that every `from` and `to` path exists in the samples. Return a draft, never write configuration.
- **Consequences**: Bad suggestions are flagged rather than shipped. Samples must be dummy data; the UI says so.

## ADR-009 Simulated systems on their own API
- **Decision**: The simulators run behind a separate HTTP API, so the gateway makes real HTTPS calls, with real latency and failure modes.

## ADR-010 Vanilla JS dashboard on S3 + CloudFront with OAC
- **Decision**: No framework or build step for the dashboard. The private bucket is reachable only through CloudFront Origin Access Control. `config.json` with the API URL is written at deploy.
