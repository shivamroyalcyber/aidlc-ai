# Implementation Plan: U4 Platform Infrastructure

## Tasks
- [ ] 1. `cdk.json`, `infra/bin/app.ts`, `infra/lib/bridgex-stack.ts`: table, secrets, Lambdas, HTTP APIs, throttling, CORS
  - _Requirements: 1.1–1.3, 2.1–2.3_
- [ ] 2. Dashboard hosting: bucket, CloudFront with OAC, BucketDeployment with `config.json`
  - _Requirements: 3.1, 3.2_
- [ ] 3. Observability: log groups, CloudWatch dashboard, alarm
  - _Requirements: 4.1–4.3_
- [ ] 4. Outputs, `scripts/show-api-key.sh`, `scripts/smoke.sh`
  - _Requirements: 5.1, 5.2_
- [ ] 5. Synth, deploy, smoke test, record the deployment log
  - _Requirements: 5.1–5.3_
