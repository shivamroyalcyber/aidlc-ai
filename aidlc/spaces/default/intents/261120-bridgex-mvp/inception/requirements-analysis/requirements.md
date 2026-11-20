# Requirements Analysis: BridgeX MVP

**Stage**: 2.3 Requirements Analysis
**Lead role**: product
**Sources**: [intent](../../ideation/intent-capture/intent.md), [scope](../../ideation/scope-definition/scope.md), user answers in the audit log (2026-11-20T08:20Z).

## Clarifying questions and answers
| # | Question | Answer | Who |
|---|---|---|---|
| Q1 | Demo both directions live, or modern→legacy only? | Use dummy XML/JSON requests and responses. Main focus is transforming requests and responses between XML and JSON. | Person |
| Q2 | PostgreSQL or DynamoDB? | "Check whatever is good for you." Kiro chose DynamoDB (ADR-005). | Person delegated |
| Q3 | Deploy to AWS or run locally? | Deploy to the AWS demo account provided by the AWS team. | Person |
| Q4 | Time and team? | Today, 3–4 hours until the presentation. | Person |
| Q5 | Include AI-suggested mapping? | Delegated ("do whatever you feel good"). Kiro included it as a Could item, validated and never auto-applied. | Person delegated |

## Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Transform a REST/JSON client request into a SOAP 1.1 envelope for the target operation, using the integration's mapping. | Must |
| FR-02 | Transform the SOAP response body into JSON with mapped names and converted types. | Must |
| FR-03 | Transform a SOAP/XML client request into a JSON request for a REST target (legacy-to-modern). | Must |
| FR-04 | Transform the REST/JSON response into a SOAP response envelope for the legacy client. | Must |
| FR-05 | Mappings are declarative and support renaming, nested paths, type conversion (string, number, integer, boolean, date), legacy date formats, value lookups, defaults and repeating elements. | Must |
| FR-06 | Each integration is a configuration document with route, direction, target endpoint, SOAP namespace and action, timeout, retry policy, idempotency flag, fault-to-status map and sample payloads. Placeholders such as `${CORE_BANKING_URL}` resolve from the environment. | Must |
| FR-07 | Validate the client payload against the integration's schema (type, required, pattern, min/max, length, enum) before any downstream call. | Must |
| FR-08 | Translate SOAP faults and HTTP errors into a JSON error model for REST clients, and into SOAP faults for SOAP clients. | Must |
| FR-09 | Authenticate clients with an API key sent in `x-api-key`. `/health` is the only open route. | Must |
| FR-10 | Inject downstream credentials (WS-Security UsernameToken for SOAP targets, Bearer token for REST targets) from AWS Secrets Manager. Clients never see them. | Must |
| FR-11 | Retry idempotent operations on timeout, network error, 429, 502, 503 and 504 with exponential backoff and jitter. Never retry a SOAP fault or a non-idempotent operation. | Should |
| FR-12 | Require an `Idempotency-Key` header for non-idempotent operations. Replay the stored response for a repeated key with the same body; reject a repeated key with a different body. | Should |
| FR-13 | Record every request with integration, status, latency, attempts, and the four stages (client request, downstream request, downstream response, client response), with sensitive values masked. | Must |
| FR-14 | Provide admin APIs for statistics, the request list and request details. | Must |
| FR-15 | Provide a transform preview that runs a request or response transformation on a dummy payload without calling the downstream system. | Should |
| FR-16 | Let an operator inject failures (HTTP 503 or timeout) into a simulated system for the next N calls. | Should |
| FR-17 | Provide a web dashboard for statistics, request history, transformation details, playground, transform preview, failure injection and integrations. | Should |
| FR-18 | Suggest field mappings from a source sample and a target sample using Amazon Bedrock. Validate every suggested path against the samples. Never apply a suggestion automatically. | Could |
| FR-19 | Provide a simulated SOAP core banking service with `GetAccountBalance`, `GetTransactionHistory` and `TransferFunds`, SOAP faults and a WS-Security check. | Must |
| FR-20 | Provide a simulated REST FinTech credit-score service that checks a Bearer token. | Must |

## Non-functional requirements
| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Security | Constant-time API key comparison. Secrets only in Secrets Manager. No secrets or full account numbers in logs. Reject XML with `DOCTYPE` or `ENTITY` declarations. Payload limit 64 KB. Least-privilege IAM. Private S3 bucket behind CloudFront OAC. HTTPS only. API throttling. |
| NFR-02 | Performance | Gateway overhead under 150 ms p95 on a warm Lambda, excluding downstream time. |
| NFR-03 | Reliability | Per-attempt timeout 2.5 s by default, at most 3 attempts, whole request under 10 s. |
| NFR-04 | Observability | Structured JSON logs, CloudWatch Embedded Metric Format metrics per integration, a CloudWatch dashboard and an alarm on downstream failures. |
| NFR-05 | Cost | Serverless and pay-per-request. Request logs expire after 7 days. Demo cost under USD 1 per day. |
| NFR-06 | Maintainability | Adding an integration needs one JSON file and its samples, with no code change. TypeScript strict mode. Unit tests for every requirement marked Must. |
| NFR-07 | Portability | A local server runs the whole flow, including simulators and dashboard, without AWS. |

## Traceability
Stories: [stories.md](../user-stories/stories.md). Units: [unit-of-work-story-map.md](../units-generation/unit-of-work-story-map.md). Unit specs: `.kiro/specs/<unit>/requirements.md`.
