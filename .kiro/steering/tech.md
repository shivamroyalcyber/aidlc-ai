---
inclusion: always
---
# Tech

## Stack
- TypeScript (strict), Node.js 22 on AWS Lambda (arm64). ES modules (`"type": "module"`).
- `fast-xml-parser` for XML and SOAP. No SOAP client library (ADR-003).
- AWS SDK for JavaScript v3: DynamoDB (`lib-dynamodb`), Secrets Manager, Bedrock Runtime.
- AWS CDK v2 in TypeScript for infrastructure. API Gateway HTTP API, Lambda, DynamoDB, Secrets Manager, S3 + CloudFront (OAC), CloudWatch.
- Dashboard: plain HTML, CSS and ES-module JavaScript. No framework, no build step.
- Tests: Vitest. Approved by the person on 2026-11-20 (delegated decision in the audit log).

## Commands (run from `bridgex/`)
- `npm test`: run Vitest once.
- `npm run typecheck`: `tsc --noEmit`.
- `npm run check`: typecheck and tests. Run before every commit.
- `npm run local`: local server with simulators and dashboard on http://localhost:3000. Long-running; start it as a background process.
- `npm run synth` / `npm run deploy`: CDK synth or deploy to `us-east-1`. Deploy needs AWS credentials in the environment.
- `scripts/smoke.sh <gateway-url> <api-key>`: smoke-test a deployed stack.

## Conventions
- Pure functions in `src/transform/`. No AWS SDK imports there.
- Inject dependencies (HTTP client, stores, clock, secrets) into the pipeline so it runs in tests and locally without AWS.
- Named exports only. No default exports.
- Errors returned to clients use the error model in `contract-summary.md`. Never return stack traces.
- Add a dependency only after recording the decision in the audit log.
- Commit messages: `<type>(<unit>): <summary>`, for example `feat(transformation-engine): add SOAP fault parsing`.
- Branch: `feat/bridgex-mvp` in the `/workshop` repository. Never push or merge; a person does that.
