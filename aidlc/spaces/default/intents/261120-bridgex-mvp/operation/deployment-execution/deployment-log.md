# Deployment Log (Stages 4.2 Environment Provisioning, 4.3 Deployment Execution)

| Field | Value |
|---|---|
| Account / region | 385840043208 / us-east-1 |
| Role | `WSParticipantRole/Participant` (temporary STS credentials from the AWS team, kept in `~/.bridgex-aws-env`, mode 600, outside the repo) |
| Stack | `BridgeXStack` (CDK v2, 38 resources) |
| Bootstrap | `CDKToolkit` created 2026-11-20T08:26:19Z |

## Deployments
| # | Time (UTC) | Commit | Change | Result |
|---|---|---|---|---|
| 1 | 09:09–09:13 | `3bfe311` + infra | First create: table, 3 secrets, 2 Lambdas, 2 HTTP APIs, S3 + CloudFront (OAC), CloudWatch dashboard and alarm. Placeholder dashboard page | `CREATE_COMPLETE`; smoke 11/11 |
| 2 | 09:19–09:21 | `71c99b4` | Real dashboard, AI preview field | `UPDATE_COMPLETE`; dashboard DOM run 20/20 incl. Bedrock |
| 3 | ~09:36 | `6a797d1` | Review fixes W3, W4 (Bedrock IAM without region wildcard) | `UPDATE_COMPLETE`; smoke 11/11; AI 9/9 verified |
| 4 | ~09:48 | final | Dashboard hint for repeating XML lists | `UPDATE_COMPLETE`; smoke 11/11; dashboard DOM run 19/19 |

## Outputs
| Output | Value |
|---|---|
| Dashboard | https://dx6gjz51ih1ul.cloudfront.net |
| Gateway API | https://ouvng54n73.execute-api.us-east-1.amazonaws.com |
| Simulated systems API | https://k2bcuw40ok.execute-api.us-east-1.amazonaws.com |
| API key | Secrets Manager, read with `bridgex/scripts/show-api-key.sh` (value never written to the repo) |
| CloudWatch dashboard | `BridgeX-Operations` |
| Alarm | `BridgeXStack-DownstreamFailuresAlarm552B25AE-xf5go4j0bcqk` (state OK at 09:40Z) |

## Rollback
Redeploy the previous commit with `npm run deploy`. Lambda code and the dashboard are replaced in place; the table and secrets are unchanged.

## Teardown (a person decides)
`cd bridgex && npx cdk destroy BridgeXStack`. Every resource has `RemovalPolicy.DESTROY` and the bucket empties itself. The `ops` agent is not allowed to run this.
