# Scope Definition

**Stage**: 1.4 Scope Definition
**Lead role**: product, supported by delivery

## In scope (MVP)
| Priority | Capability | Proposal feature |
|---|---|---|
| Must | REST/JSON → SOAP/XML request transformation and SOAP → JSON response transformation | SOAP-to-REST, REST-to-SOAP, bidirectional responses |
| Must | SOAP/XML → REST/JSON request and JSON → SOAP response (legacy-to-modern direction) | Bidirectional communication |
| Must | Declarative field mapping with type conversion, legacy date formats, code lookups and repeating elements | Configurable field mapping |
| Must | Integration configuration: route, target endpoint, SOAP action, retry policy | Integration configuration |
| Must | Request validation from the integration's schema | Request validation |
| Must | SOAP fault and HTTP error translation into meaningful client errors | Error handling |
| Must | API key authentication for clients; WS-Security UsernameToken and Bearer token for downstream systems | Authentication management |
| Must | Request log with each transformation stage, masked | Request logging |
| Should | Retry with backoff for idempotent operations; idempotency keys for transfers | Retry mechanism |
| Should | Monitoring dashboard: totals, failures, latency, history, transformation details, failure injection | Monitoring dashboard |
| Should | Transform preview with dummy XML/JSON, no downstream call | User answer 1 |
| Could | AI-suggested field mapping with Amazon Bedrock | Future enhancement promoted to MVP (differentiator) |
| Could | CloudWatch metrics, dashboard and alarm | Operations visibility |

## Out of scope
WSDL discovery, SOAP 1.2, MTOM attachments, WS-Security signatures, JWT/OAuth for clients, GraphQL, visual drag-and-drop mapping, mapping versioning UI, multi-tenant configuration storage, CI/CD pipeline, load testing.

## Definition of done for the hackathon
- Unit tests pass for the transformation engine, gateway pipeline and simulators.
- Stack deployed in `us-east-1`; smoke tests pass against the deployed URLs.
- Demo runbook rehearsed once against the deployed stack.
- AI-DLC record (state, audit, artifacts) up to date.
