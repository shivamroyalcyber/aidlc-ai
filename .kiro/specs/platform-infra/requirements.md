# Requirements Document: U4 Platform Infrastructure

## Introduction
U4 is one AWS CDK stack, `BridgeXStack`, that deploys everything to account 385840043208 in `us-east-1`. It also covers the AI-DLC Operation stages in this route: Environment Provisioning (4.2), Deployment Execution (4.3) and Observability Setup (4.4). Source requirements: NFR-01, NFR-04, NFR-05; ADR-001, ADR-005, ADR-007, ADR-009, ADR-010.

## Requirements

### Requirement 1: Compute and APIs
1. The stack SHALL create a gateway Lambda and a simulators Lambda (Node.js 22, arm64, bundled with esbuild), each behind its own HTTP API with a `$default`-style proxy route.
2. The gateway API SHALL allow CORS only from the CloudFront dashboard origin and `http://localhost:3000`, with headers `content-type`, `x-api-key`, `idempotency-key`, `soapaction`, and SHALL expose `x-bridgex-*` and `x-idempotent-replay`.
3. The gateway API stage SHALL be throttled to 20 requests per second with a burst of 50.

### Requirement 2: Data and secrets
1. The stack SHALL create one on-demand DynamoDB table with `pk`, `sk` and TTL attribute `ttl`.
2. The stack SHALL generate three secrets: the client API key, the core banking UsernameToken credentials, and the FinTech Bearer token. Lambdas SHALL receive only secret ARNs.
3. Each Lambda SHALL have read access only to the secrets it needs; the gateway SHALL have `bedrock:InvokeModel` only for the configured model.

### Requirement 3: Dashboard hosting
1. The stack SHALL host the dashboard in a private S3 bucket behind CloudFront with Origin Access Control, HTTPS redirect and `index.html` as the default object.
2. The stack SHALL write `config.json` with the gateway URL at deploy time.

### Requirement 4: Observability
1. Lambda log groups SHALL keep logs for one week.
2. The stack SHALL create a CloudWatch dashboard with requests, failures, retries and latency per integration (from EMF) and Lambda errors and duration.
3. The stack SHALL create an alarm when `Failures` exceeds 5 in 5 minutes.

### Requirement 5: Outputs and operations
1. The stack SHALL output the dashboard URL, gateway URL, simulators URL, API key secret name and CloudWatch dashboard name.
2. `scripts/smoke.sh` SHALL check health, balance, a SOAP credit-score call and an auth failure against a deployed stack.
3. Everything SHALL be removable with `cdk destroy` (demo data only; `RemovalPolicy.DESTROY`).
