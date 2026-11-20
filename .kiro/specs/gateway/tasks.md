# Implementation Plan: U3 Gateway

## Tasks
- [ ] 1. Helpers
  - [ ] 1.1 `src/shared/ids.ts`, `auth.ts`, `retry.ts`, `http-client.ts`, `secrets.ts`
  - _Requirements: 1.2, 3.1, 3.2_
- [ ] 2. Stores
  - [ ] 2.1 `store.ts` interfaces and in-memory stores
  - [ ] 2.2 `dynamo-store.ts`
  - _Requirements: 4.2, 4.3, 5.1, 5.3_
- [ ] 3. Pipeline
  - [ ] 3.1 `pipeline.ts` steps 1–7
  - _Requirements: 2.1–2.7, 3.1–3.4, 4.1–4.4, 5.1–5.5_
- [ ] 4. App and admin API
  - [ ] 4.1 `app.ts` with auth, health, routing; `stats.ts`; `metrics.ts`
  - _Requirements: 1.1, 1.3, 6.1–6.5_
- [ ] 5. Adapters
  - [ ] 5.1 `lambda.ts` (API Gateway v2)
  - [ ] 5.2 `scripts/local-server.ts` serving gateway, simulators and dashboard
  - _Requirements: 7.1_
- [ ] 6. Tests
  - [ ] 6.1 `test/gateway/pipeline.test.ts`, `retry.test.ts`, `stats.test.ts`, `auth.test.ts`
  - _Requirements: all of the above_
