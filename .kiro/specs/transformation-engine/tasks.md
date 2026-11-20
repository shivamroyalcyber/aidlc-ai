# Implementation Plan: U1 Transformation Engine

## Overview
Pure functions first, then the registry and integration documents, then golden tests. Run `npm run check` from `bridgex/` after each task.

## Tasks
- [x] 1. Project scaffolding
  - [x] 1.1 `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` in `bridgex/`
  - _Requirements: NFR-06_
- [x] 2. Safe XML and SOAP
  - [x] 2.1 `errors.ts`, `xml.ts` with DOCTYPE/ENTITY rejection, size limit, escaping builder
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 2.2 `soap.ts`: request, response and fault builders, `parseSoap` with fault detail extraction
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.3 Tests `test/transform/xml.test.ts`, `test/transform/soap.test.ts`
- [x] 3. Mapping and validation
  - [x] 3.1 `paths.ts`, `convert.ts`, `mapping.ts`
    - _Requirements: 3.1–3.8_
  - [x] 3.2 `validate.ts`
    - _Requirements: 4.1, 4.2_
  - [x] 3.3 `mask.ts`
    - _Requirements: 7.1, 7.2_
  - [x] 3.4 Tests `mapping.test.ts`, `validate.test.ts`, `mask.test.ts`
- [x] 4. Registry and integration documents
  - [x] 4.1 `config/types.ts`, `config/registry.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 4.2 `account-balance.json`, `transaction-history.json`, `fund-transfer.json`, `credit-score.json` with samples
    - _Requirements: FR-06, FR-19, FR-20_
  - [x] 4.3 Tests `test/config/registry.test.ts`
- [x] 5. Engine and preview
  - [x] 5.1 `engine.ts`: `transformRequest`, `transformResponse`, `previewTransform`
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 5.2 Golden tests `test/transform/engine.test.ts`, including the proposal example
    - _Requirements: 6.3_
