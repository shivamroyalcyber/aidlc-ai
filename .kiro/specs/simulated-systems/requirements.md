# Requirements Document: U2 Simulated Systems

## Introduction
The person has no access to real legacy systems (constraint C-02). U2 provides two realistic stand-ins: a SOAP 1.1 Core Banking System and a REST FinTech credit-score API. Both check credentials and support failure injection so the demo can show retries. Source requirements: FR-16, FR-19, FR-20 and contract sections 3–5.

## Glossary
- **Core_Banking**: The simulated SOAP service at `/core-banking/CoreBankingService`.
- **FinTech**: The simulated REST service at `/fintech/v1/credit-scores`.
- **Chaos_Store**: Storage for the failure-injection setting of each target (`mode`, `remaining`).

## Requirements

### Requirement 1: Core Banking operations
**User Story:** As a demo presenter, I want a believable legacy bank, so that the audience sees real SOAP traffic. (FR-19)
#### Acceptance Criteria
1. WHEN `GetAccountBalance` is called for a seeded account THEN Core_Banking SHALL return the account number, name, available and ledger balance, currency, status code and `AsOfDate` in `yyyyMMdd`.
2. WHEN `GetTransactionHistory` is called THEN Core_Banking SHALL return transactions within `FromDate`–`ToDate` (inclusive, `yyyyMMdd`), newest first, at most `MaxRecords`, with `RecordCount`.
3. WHEN `TransferFunds` is called with valid accounts and enough funds THEN Core_Banking SHALL return a new `TransactionReference`, `Status` `S`, `DebitedAmount` and `ValueDate`.
4. WHEN an account is unknown, funds are insufficient, the source account is frozen or the amount is not positive THEN Core_Banking SHALL return a SOAP fault with `ACCOUNT_NOT_FOUND`, `INSUFFICIENT_FUNDS`, `ACCOUNT_FROZEN` or `INVALID_AMOUNT`.
5. WHEN the operation is unknown THEN Core_Banking SHALL return a fault with `UNKNOWN_OPERATION`.
6. Core_Banking SHALL add 40–120 ms of latency to each call to resemble a legacy system.

### Requirement 2: Core Banking authentication
**User Story:** As the core banking owner, I want only BridgeX to call the core. (FR-10)
#### Acceptance Criteria
1. WHEN the WS-Security UsernameToken is missing or wrong THEN Core_Banking SHALL return HTTP 500 with a fault `AUTH_FAILED`.

### Requirement 3: FinTech credit score
**User Story:** As a legacy loan developer, I want a modern REST API to call through BridgeX. (FR-20)
#### Acceptance Criteria
1. WHEN a seeded customer is requested with a valid Bearer token THEN FinTech SHALL return `customerId`, `score`, `band`, `reportDate` (ISO) and `factors`.
2. WHEN the token is missing or wrong THEN FinTech SHALL return HTTP 401 with error code `UNAUTHORIZED`.
3. WHEN the customer is unknown THEN FinTech SHALL return HTTP 404 with error code `CUSTOMER_NOT_FOUND`.
4. WHEN the body is not valid JSON or lacks `customerId` THEN FinTech SHALL return HTTP 400 with error code `BAD_REQUEST`.

### Requirement 4: Failure injection
**User Story:** As a demo presenter, I want to break a simulator on purpose, so that I can show retries and monitoring. (FR-16)
#### Acceptance Criteria
1. WHILE the Chaos_Store for a target has `remaining` above zero THEN each call SHALL decrement `remaining` by exactly one, atomically.
2. WHEN a call consumes chaos with `mode` `error` THEN the simulator SHALL return HTTP 503 with a non-SOAP body.
3. WHEN a call consumes chaos with `mode` `timeout` THEN the simulator SHALL wait 6 seconds before answering normally.
4. WHEN `remaining` is zero THEN the simulator SHALL behave normally.
