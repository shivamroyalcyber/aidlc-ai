# User Stories

**Stage**: 2.4 User Stories
Personas: [personas.md](personas.md). Requirement IDs: [requirements.md](../requirements-analysis/requirements.md).

## US-01 Check a balance with JSON (Arjun) — FR-01, FR-02, FR-09
As a mobile app developer, I want to POST `{"accountId":"ACC101"}` to BridgeX and get `{"accountId":"ACC101","availableBalance":50000,"currency":"INR"}`, so that I never handle SOAP.
- Given a valid API key and account, the response is HTTP 200 JSON and `availableBalance` is a number.
- Given no API key, the response is HTTP 401 and no downstream call is made.

## US-02 See transaction history in modern shapes (Arjun) — FR-02, FR-05
As a mobile app developer, I want legacy dates (`20261118`) as ISO dates and codes (`CR`/`DR`) as `credit`/`debit`, so that my app needs no conversion code.
- A history with one transaction still returns a `transactions` array.
- Amounts are numbers, dates are `YYYY-MM-DD`, types are `credit` or `debit`.

## US-03 Transfer funds safely (Arjun) — FR-12, FR-11, FR-08
As a mobile app developer, I want a transfer retried by my app with the same `Idempotency-Key` to return the original result, so that a customer is never charged twice.
- Without the header, the response is HTTP 400 `IDEMPOTENCY_KEY_REQUIRED`.
- The same key and body return the stored response with `x-idempotent-replay: true`, and the core system is not called again.
- The same key with a different body returns HTTP 409.
- Insufficient funds returns HTTP 422 `INSUFFICIENT_FUNDS` from the SOAP fault.

## US-04 Call a REST API from a SOAP system (Kavya) — FR-03, FR-04, FR-10, FR-20
As a legacy loan system developer, I want to send a `GetCreditScore` SOAP request and get a SOAP response, so that the loan system can use a modern FinTech API unchanged.
- BridgeX sends JSON with a Bearer token to the FinTech API.
- A FinTech error comes back as a SOAP fault with an error code.

## US-05 Add an integration without code (Priya) — FR-05, FR-06, FR-07
As an integration developer, I want to describe routes, targets and field mappings in one JSON document, so that a new integration is a reviewed configuration change.
- An invalid mapping document fails the test suite before deploy.
- An invalid client payload returns HTTP 400 with the failing fields.

## US-06 Preview a transformation (Priya) — FR-15
As an integration developer, I want to paste a dummy JSON or XML payload and see the transformed output, so that I can check a mapping without calling the legacy system.

## US-07 Get mapping suggestions (Priya) — FR-18
As an integration developer, I want to paste a sample source and target payload and get suggested mappings with confidence and reasons, so that I start from a draft instead of a blank file.
- Suggestions whose paths do not exist in the samples are flagged and excluded from the draft.

## US-08 Monitor integrations (Meera) — FR-13, FR-14, FR-17
As an operations engineer, I want totals, success rate, latency, retries and recent requests per integration, so that I can spot problems.
- Clicking a request shows the four transformation stages and each attempt.
- Account numbers appear masked (`***101`) and passwords never appear.

## US-09 Survive a legacy outage (Meera) — FR-11, FR-16
As an operations engineer, I want transient legacy failures retried automatically, so that clients don't see brief outages.
- With "fail next 2 calls" injected, a balance request succeeds on attempt 3.
- With "fail next 5 calls" injected, the client gets HTTP 503 `DOWNSTREAM_UNAVAILABLE` after 3 attempts.

## US-10 Keep the core unchanged and its credentials private (Rahul) — FR-10, NFR-01
As the core banking owner, I want BridgeX to hold the WS-Security credentials, so that no channel app ever receives them.
- The SOAP request carries a UsernameToken; the logged copy shows `********` instead of the password.
