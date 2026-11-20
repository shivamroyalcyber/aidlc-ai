# Contract Design

**Stage**: 2.8 Contract Design
**Lead role**: architect, supported by aws-platform

## 1. Gateway API (client-facing)
All routes except `/health` require `x-api-key`. Every response carries `x-bridgex-request-id`. Integration responses also carry `x-bridgex-attempts` and `x-bridgex-latency-ms`.

| Method | Path | Integration | Body in → out |
|---|---|---|---|
| GET | `/health` | none | → `{"status":"ok"}` |
| POST | `/api/v1/accounts/balance` | `account-balance` | JSON → JSON (SOAP `GetAccountBalance` downstream) |
| POST | `/api/v1/accounts/transactions` | `transaction-history` | JSON → JSON (SOAP `GetTransactionHistory`) |
| POST | `/api/v1/transfers` | `fund-transfer` | JSON → JSON (SOAP `TransferFunds`), needs `Idempotency-Key` |
| POST | `/soap/v1/LoanService` | `credit-score` | SOAP → SOAP (REST `POST /v1/credit-scores` downstream) |

### Admin API (dashboard)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/integrations` | Integration documents without secrets |
| GET | `/admin/stats` | Totals, success rate, latency, retries, per-integration figures, per-minute series |
| GET | `/admin/requests?limit=50` | Recent request summaries, newest first |
| GET | `/admin/requests/{id}` | One request with its four stages and attempts |
| POST | `/admin/transform-preview` | `{"integrationId","stage":"request"\|"response","payload"}` → `{"output","contentType","errors"}` |
| GET / POST | `/admin/chaos` | Read or set `{"target":"core-banking"\|"fintech","mode":"error"\|"timeout"\|"off","count":N}` |
| POST | `/admin/mapping-suggestions` | `{"source":{"format","sample"},"target":{"format","sample"}}` → suggestions and draft mapping |

### Error model (REST clients)
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Request validation failed", "requestId": "mi7k2x3a0-4f9c", "details": ["accountId: does not match pattern ^ACC[0-9]{3,12}$"] } }
```
| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or wrong `x-api-key` |
| `ROUTE_NOT_FOUND` | 404 | No integration for the method and path, or unknown SOAP operation |
| `INVALID_PAYLOAD` | 400 | Body is not valid JSON or XML, or XML has a DOCTYPE |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 64 KB |
| `VALIDATION_FAILED` | 400 | Schema check failed |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Non-idempotent integration called without `Idempotency-Key` |
| `IDEMPOTENCY_CONFLICT` | 409 | Key reused with a different body, or the first call is still running |
| fault code from `faults` map | per map | SOAP fault from the legacy system, e.g. `ACCOUNT_NOT_FOUND` → 404 |
| `DOWNSTREAM_FAULT` | 502 | Unmapped SOAP fault or REST 4xx |
| `DOWNSTREAM_UNAVAILABLE` | 503 | Retries exhausted, or a non-retryable 5xx |
| `DOWNSTREAM_TIMEOUT` | 504 | Last attempt timed out |
| `MAPPING_FAILED` | 502 | Downstream response does not fit the mapping |

### Error model (SOAP clients)
HTTP 500 (400 for client-side errors) with a SOAP 1.1 fault. `faultcode` is `soapenv:Client` or `soapenv:Server`; `detail/BridgeXFault` has `ErrorCode`, `ErrorMessage` and `RequestId`.

## 2. Integration document
```jsonc
{
  "id": "account-balance",
  "name": "Account balance inquiry",
  "direction": "rest-to-soap",                 // or "soap-to-rest"
  "route": { "method": "POST", "path": "/api/v1/accounts/balance" },
  //  soap-to-rest routes add: "soapOperation", "soapNamespace", "responseElement"
  "target": {
    "type": "soap", "url": "${CORE_BANKING_URL}/CoreBankingService",
    "operation": "GetAccountBalance", "namespace": "http://legacybank.example.com/corebanking",
    "soapAction": "http://legacybank.example.com/corebanking/GetAccountBalance",
    "responseElement": "GetAccountBalanceResponse", "auth": "ws-security"
  },
  //  REST targets: { "type": "rest", "url": "${FINTECH_URL}/v1/credit-scores", "method": "POST", "auth": "bearer" }
  "idempotent": true,
  "requireIdempotencyKey": false,
  "timeoutMs": 2500,
  "retry": { "maxAttempts": 3, "baseDelayMs": 200 },
  "request": {
    "schema": { "accountId": { "type": "string", "required": true, "pattern": "^ACC[0-9]{3,12}$" } },
    "mappings": [ { "from": "accountId", "to": "AccountNumber", "sensitive": true } ]
  },
  "response": {
    "mappings": [
      { "from": "AccountNumber", "to": "accountId", "sensitive": true },
      { "from": "AvailableBalance", "to": "availableBalance", "type": "number" },
      { "from": "AsOfDate", "to": "asOf", "type": "date", "sourceFormat": "yyyyMMdd", "targetFormat": "iso" },
      { "from": "Status", "to": "status", "lookup": { "A": "active", "F": "frozen" } }
    ]
  },
  "faults": { "ACCOUNT_NOT_FOUND": { "status": 404 } },
  "samples": { "request": "{...}", "response": "<soapenv:Envelope>...</soapenv:Envelope>" }
}
```
Mapping rule fields: `from` and `to` (dot paths), `type` (`string`, `number`, `integer`, `boolean`, `date`), `sourceFormat`/`targetFormat` (`iso`, `yyyyMMdd`, `ddMMyyyy`), `lookup`, `default`, `required`, `sensitive` (mask in logs), `items` (map each element of a repeating structure), `array` (repeating primitive values). A single XML element where an array is expected is treated as a one-element array.

## 3. Simulated Core Banking (SOAP 1.1)
`POST {CORE_BANKING_URL}/CoreBankingService`, namespace `http://legacybank.example.com/corebanking`, WS-Security UsernameToken required.

| Operation | Request elements | Response elements | Faults |
|---|---|---|---|
| `GetAccountBalance` | `AccountNumber` | `AccountNumber`, `AccountName`, `AvailableBalance`, `LedgerBalance`, `Currency`, `Status` (A/F), `AsOfDate` (yyyyMMdd) | `ACCOUNT_NOT_FOUND` |
| `GetTransactionHistory` | `AccountNumber`, `FromDate`, `ToDate`, `MaxRecords` | `AccountNumber`, `RecordCount`, `Transactions/Transaction[]` (`TransactionId`, `PostingDate`, `Amount`, `DrCrIndicator` CR/DR, `Narration`, `RunningBalance`) | `ACCOUNT_NOT_FOUND` |
| `TransferFunds` | `FromAccount`, `ToAccount`, `Amount`, `Currency`, `Reference` | `TransactionReference`, `Status` (S), `DebitedAmount`, `ValueDate` | `ACCOUNT_NOT_FOUND`, `INSUFFICIENT_FUNDS`, `ACCOUNT_FROZEN`, `INVALID_AMOUNT` |

Any operation: missing or wrong UsernameToken → fault `AUTH_FAILED`; unknown operation → fault `UNKNOWN_OPERATION`.
Seed accounts: `ACC101` (50000 INR), `ACC102` (125000.50 INR), `ACC103` (820.75 INR), `ACC104` (frozen).

## 4. Simulated FinTech credit score (REST)
`POST {FINTECH_URL}/v1/credit-scores` with `Authorization: Bearer <token>`.
- Request: `{"customerId":"CUST1001","requestedAmount":500000}`
- 200: `{"customerId","score","band":"EXCELLENT|GOOD|FAIR|POOR","reportDate":"YYYY-MM-DD","factors":["..."]}`
- 401 `{"error":{"code":"UNAUTHORIZED"}}`; 404 `{"error":{"code":"CUSTOMER_NOT_FOUND"}}`
Seed customers: `CUST1001` (742 GOOD), `CUST1002` (598 FAIR), `CUST1003` (811 EXCELLENT).

## 5. Failure injection
The chaos item `pk=CHAOS, sk=<target>` holds `mode` and `remaining`. Each simulator call decrements `remaining` atomically when it is above zero, then fails with HTTP 503 (`error`) or sleeps 6 s (`timeout`).
