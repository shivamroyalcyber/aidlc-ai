# Review Report (Stage 3.6, quality + devsecops)

**Reviewer**: Kiro `reviewer` agent (read-only, `.kiro/agents/reviewer.md`)
**Branch**: `feat/bridgex-mvp`, reviewed at commit `009fdfe` on 2026-11-20 ~09:30Z
**Checks run by the reviewer**: `npm run check` (104 tests passed, typecheck clean), `npm run synth` (clean)

## Findings and disposition

| ID | Severity | Location | Finding | Disposition |
|---|---|---|---|---|
| W1 | Warning | `bridgex/src/transform/xml.ts:15` | `processEntities: true` is safe only because DOCTYPE/ENTITY are rejected first; the dependency is implicit | **Fixed** in `6a797d1`: comment marks the guard as load-bearing. Existing tests `xml.test.ts` 1.1 and `pipeline.test.ts` XXE case cover it |
| W2 | Warning | `bridgex/src/transform/validate.ts:26` | Patterns compiled per request | **Accepted** for the MVP: patterns are developer-authored, four integrations, warm Lambda. Backlog item for production |
| W3 | Warning | `bridgex/src/gateway/admin.ts:57` | Mapping-suggestion body cast without shape checks | **Fixed** in `6a797d1`, new test "mapping suggestions validate the request shape before calling the model (review W3)" |
| W4 | Warning | `bridgex/infra/lib/bridgex-stack.ts:105` | Bedrock foundation-model ARN used a region wildcard | **Fixed** in `6a797d1`: checked `aws bedrock get-inference-profile` (routes to us-east-1, us-east-2, us-west-2) and listed those three ARNs. Redeployed; AI call verified |
| S1 | Suggestion | `pipeline.ts:44` | Log when best-effort masking cannot parse | **Declined**: a parse failure there means the request is rejected anyway and the raw body would be the only content; adding the log adds noise without exposing data |
| S2 | Suggestion | `account-balance.json` sample | Minimal response sample | **Declined on purpose**: the sample is the proposal's exact example, and golden test 6.3 proves BridgeX reproduces it. The simulator returns the full record in the live demo |
| S3 | Suggestion | `dashboard/app.js` | No `innerHTML` with data | No action (confirms the design) |
| S4 | Suggestion | `pipeline.ts:131` | Timed-out transfer keeps its key with the 504 answer | **Confirmed intentional** (ADR-006): after a timeout the core may have debited; replaying the "unknown" answer forces reconciliation instead of a possible double debit |

## Reviewer's "could not verify", and how it was closed
| Item | Closed by |
|---|---|
| Browser behaviour, CORS from CloudFront | DOM run of the dashboard against the deployed CloudFront URL (20 checks including AI mapping, no page errors) and a CORS preflight check; see [test-report.md](test-report.md) |
| Deployed AWS behaviour (Secrets Manager, OAC, throttling, EMF, Bedrock) | `scripts/smoke.sh` 11/11 against AWS; `BridgeX` namespace has 20 metrics; Bedrock suggestion call returned 9/9 verified suggestions |
| Idempotency under concurrency | Not load-tested. The DynamoDB conditional put is the guard. Recorded as a known limit |
| CDK drift | Three `cdk deploy` runs from the same branch; last at 09:3xZ succeeded with no failed resources |
