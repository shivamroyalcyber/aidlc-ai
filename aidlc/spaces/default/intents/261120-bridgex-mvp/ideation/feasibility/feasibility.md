# Feasibility & Constraints

**Stage**: 1.3 Feasibility & Constraints
**Lead role**: architect, supported by aws-platform

## Constraint register
| ID | Constraint | Source | Effect on design |
|---|---|---|---|
| C-01 | 3–4 hours until the presentation, one developer plus Kiro | User, 2026-11-20 | MVP profile at Minimal–Standard depth; no CI pipeline; vanilla JS dashboard |
| C-02 | No access to real legacy systems | User answer 1 | Simulated SOAP core banking and simulated REST FinTech services, deployed with the stack |
| C-03 | Must deploy to the AWS demo account `385840043208`, `us-east-1`, role `WSParticipantRole` | User answer 3 | Serverless services only; CDK; temporary credentials kept out of the repo |
| C-04 | Temporary STS credentials expire | AWS workshop account | Deploy early, keep a local Plan B (`npm run local`) |
| C-05 | Banking data in logs | Domain | Mask account numbers and credentials before writing logs |

## Verified in the account (2026-11-20T08:26Z)
- `sts get-caller-identity` succeeded for `WSParticipantRole/Participant`.
- `cdk bootstrap aws://385840043208/us-east-1` completed (`CDKToolkit` stack created).
- Amazon Bedrock Converse call to `us.anthropic.claude-haiku-4-5-20251001-v1:0` returned a response. AI-assisted mapping is feasible.

## Build vs buy (short market scan)
| Option | What it does well | Why BridgeX still has a place |
|---|---|---|
| MuleSoft, Boomi, Apigee | Full enterprise integration platforms | Heavy licences and long setup for a single modernisation slice |
| Apache Camel / Spring Integration | Flexible routing in code | Every mapping is code; needs Java skills and hosting |
| Amazon API Gateway mapping templates (VTL) | Lightweight JSON reshaping | Not designed for SOAP envelopes, faults or XML namespaces |
| **BridgeX** | Declarative SOAP↔REST mapping, serverless, AI-suggested mappings, built-in monitoring | Pay-per-request on AWS; a new integration is a reviewed JSON file |

## RAID log
| Type | Item | Response |
|---|---|---|
| Risk | Credentials expire before the demo | Deploy within the first two hours; `scripts/local-server.ts` runs the full flow without AWS |
| Risk | CloudFront takes several minutes to create | Deploy once early, then only update Lambda code |
| Risk | Bedrock output is not valid mapping JSON | Force a tool-use schema and validate every suggestion; never auto-apply |
| Assumption | SOAP 1.1 with document/literal style is enough for the demo | Recorded as ADR-004 |
| Issue | Existing `.kiro` agents and hooks target the old `idea-board` app | Repoint them to `bridgex/` (recorded in the audit log) |
| Dependency | `fast-xml-parser`, AWS SDK v3, `aws-cdk-lib` from npm | Pinned in `bridgex/package-lock.json` |
