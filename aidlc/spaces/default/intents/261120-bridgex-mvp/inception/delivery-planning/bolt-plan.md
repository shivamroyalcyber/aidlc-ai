# Delivery Plan (Bolts)

**Stage**: 2.9 Delivery Planning
**Lead role**: delivery
A bolt is a short, time-boxed build cycle that ends in something you can run.

| Bolt | Timebox | Units | Outcome | Exit check |
|---|---|---|---|---|
| B1 Walking skeleton | 45 min | U1, U2, U3 (balance only) | JSON → SOAP → JSON works in-process | `npm test` green; local server answers the balance call |
| B2 All integrations + reliability | 30 min | U1, U2, U3 | History, transfer with idempotency, credit score via SOAP, retries, request log, admin API | Tests for each FR marked Must |
| B3 Deploy | 20 min | U4 | Stack live in `us-east-1` | `scripts/smoke.sh` green against AWS |
| B4 Dashboard | 30 min | U5 | Overview, playground, studio, integrations | Manual check on the CloudFront URL |
| B5 Differentiators | 20 min | U6, U4 observability | Bedrock mapping suggestions, CloudWatch dashboard and alarm | Suggestion call returns validated mappings |
| B6 Demo readiness | 20 min | all | Runbook rehearsed, README, AI-DLC record closed | Person approves the demo-readiness gate |

## Risk and sequencing rationale
- The walking skeleton comes first so that a working demo exists even if later bolts slip.
- Deploying in B3 rather than at the end leaves time to fix IAM or CloudFront surprises before the credentials expire.
- U6 is last among features because it is a Could item; if time runs out it is cut without touching the core demo.

## Team allocation
One person plus Kiro. Kiro drafts specs (`spec` agent), builds (`build` agent), reviews (`reviewer` agent) and deploys (`ops` agent). The person approves gates and runs the demo.

## External dependencies
| Dependency | Needed by | Fallback |
|---|---|---|
| AWS demo account credentials | B3–B6 | Local server (`npm run local`) |
| Amazon Bedrock model access (Claude Haiku 4.5) | B5 | Hide the AI tab; show the recorded example in the runbook |
| npm registry | B1 | None needed after first install |
