# Implementation Plan: U2 Simulated Systems

## Tasks
- [ ] 1. Shared HTTP types and in-memory chaos store
  - [ ] 1.1 `src/shared/http.ts` (`HttpRequest`, `HttpResponse`, helpers), `src/shared/chaos.ts` (`ChaosStore`, `InMemoryChaosStore`)
  - _Requirements: 4.1, 4.4_
- [ ] 2. Core Banking
  - [ ] 2.1 `data.ts` seed data
  - [ ] 2.2 `core-banking.ts`: three operations, faults, WS-Security check, latency
  - _Requirements: 1.1–1.6, 2.1_
- [ ] 3. FinTech
  - [ ] 3.1 `fintech.ts`
  - _Requirements: 3.1–3.4_
- [ ] 4. Router, chaos and Lambda adapter
  - [ ] 4.1 `app.ts` with chaos handling
  - [ ] 4.2 `lambda.ts` with Secrets Manager credentials and DynamoDB chaos store (`src/shared/dynamo-chaos.ts`)
  - _Requirements: 4.1–4.4_
- [ ] 5. Tests
  - [ ] 5.1 `test/simulators/core-banking.test.ts`, `test/simulators/fintech.test.ts`
  - _Requirements: all of the above_
