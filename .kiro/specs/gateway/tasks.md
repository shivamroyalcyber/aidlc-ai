# Implementation Plan: U3 Gateway

## Tasks
- [x] 1. Helpers
  - [x] 1.1 `src/shared/ids.ts`, `auth.ts`, `retry.ts`, `http-client.ts`, `secrets.ts`
  - _Requirements: 1.2, 3.1, 3.2_
- [x] 2. Stores
  - [x] 2.1 `store.ts` interfaces and in-memory stores
  - [x] 2.2 `dynamo-store.ts`
  - _Requirements: 4.2, 4.3, 5.1, 5.3_
- [x] 3. Pipeline
  - [x] 3.1 `pipeline.ts` steps 1–7
  - _Requirements: 2.1–2.7, 3.1–3.4, 4.1–4.4, 5.1–5.5_
- [x] 4. App and admin API
  - [x] 4.1 `app.ts` with auth, health, routing; `stats.ts`; `metrics.ts`
  - _Requirements: 1.1, 1.3, 6.1–6.5_
- [x] 5. Adapters
  - [x] 5.1 `lambda.ts` (API Gateway v2)
  - [x] 5.2 `scripts/local-server.ts` serving gateway, simulators and dashboard
  - _Requirements: 7.1_
- [x] 6. Tests
  - [x] 6.1 `test/gateway/pipeline.test.ts`, `retry.test.ts`, `stats.test.ts`, `auth.test.ts`
  - _Requirements: all of the above_
