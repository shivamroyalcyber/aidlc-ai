# Intent Capture: BridgeX

**Stage**: 1.1 Intent Capture & Framing
**Lead role**: product (Kiro `spec` agent)
**Input**: "BridgeX – Enterprise Legacy System Modernization Gateway" hackathon proposal, pasted in chat on 2026-11-20.

## Intent statement
Build BridgeX, a middleware gateway that lets modern REST/JSON applications use legacy SOAP/XML services, and lets legacy SOAP clients use modern REST services, without changing either side. Transformation, field mapping, authentication, validation, retries and monitoring live in the gateway and are driven by configuration.

## Problem in one paragraph
Banks, insurers and hospitals run core systems that expose SOAP/XML. New channels (mobile apps, FinTech partners, AI services) expect REST/JSON. Today each integration is custom code, which is expensive to build and hard to maintain. Replacing the core system is risky. Organisations need one reusable integration layer.

## Stakeholders
| Stakeholder | Interest |
|---|---|
| Hackathon judges (AWS team) | A working demo, a clear AWS architecture, and visible use of AI-DLC with Kiro |
| Integration developer (primary user) | Configure a new SOAP↔REST integration without writing code |
| Mobile / FinTech app developer | Call clean JSON APIs and never see SOAP |
| Legacy system owner | No change to the core banking system |
| Operations / support | See failures, latency and retries in one place |
| Security / compliance | Authenticated access, masked account data in logs, no secrets in code |

## Demo use case
A simulated bank. A legacy Core Banking System exposes SOAP operations (balance, transaction history, fund transfer). A mobile banking app calls BridgeX with JSON. In the other direction, a legacy loan system sends SOAP to BridgeX, which calls a modern FinTech credit-score REST API.

## Success criteria (from the proposal, made testable)
1. A JSON request to BridgeX reaches the SOAP service as a valid SOAP 1.1 envelope, and the SOAP response returns to the client as JSON with the mapped field names and types.
2. A SOAP request to BridgeX reaches a REST service as JSON, and the JSON response returns as a SOAP envelope.
3. Field mappings come from a configuration document, not code.
4. An injected downstream failure is retried for safe operations, and the dashboard shows the attempts, the failure and the recovery.
5. The whole stack runs in the AWS demo account (us-east-1) and is reproducible with one `cdk deploy`.
