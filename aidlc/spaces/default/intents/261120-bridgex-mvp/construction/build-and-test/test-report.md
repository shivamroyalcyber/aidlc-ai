# Build and Test Report (Stage 3.6)

**Date**: 2026-11-20 · **Branch**: `feat/bridgex-mvp` · **Commit**: `6a797d1`

## 1. Automated tests (`npm run check` in `bridgex/`)
TypeScript 7 strict typecheck: clean. Vitest 5: **12 files, 105 tests, all passing**.

| Unit | Test file | Covers |
|---|---|---|
| U1 | `test/transform/xml.test.ts` | Req 1.1–1.5: DOCTYPE/ENTITY rejection, 64 KB limit, malformed XML, prefix removal, escaping, element-injection attempt |
| U1 | `test/transform/soap.test.ts` | Req 2.1–2.5: envelope shape (exact text), WS-Security header, foreign prefixes, fault detail, fault fallback, non-envelope, fault round-trip |
| U1 | `test/transform/mapping.test.ts` | Req 3.1–3.8: paths, prefixes, types, three date formats, lookups, defaults, required, repeating items, primitive arrays, attributes |
| U1 | `test/transform/validate.test.ts` | Req 4.1–4.2: every rule, strict JSON vs lenient XML |
| U1 | `test/transform/mask.test.ts` | Req 7.1–7.2 |
| U1 | `test/config/registry.test.ts` | Req 5.1–5.4: all bundled documents valid, file name = id, retry rule for non-idempotent, placeholders, route matching |
| U1 | `test/transform/engine.test.ts` | Req 6.1–6.4: **the proposal's balance example, exact output**; history, transfer, credit score both stages; fault mapping; every sample transforms |
| U2 | `test/simulators/core-banking.test.ts` | Req 1–2, 4: three operations, five faults, WS-Security, chaos error/timeout/isolation |
| U2 | `test/simulators/fintech.test.ts` | Req 3: score, 401, 404, 400 |
| U3 | `test/gateway/pipeline.test.ts` | Req 1–6 end to end against in-process simulators: auth, routing, validation before downstream, masking (no password, API key or full account number stored), fault mapping, SOAP-client faults incl. XXE, retry recovery with backoff, exhaustion 503, timeout 504, no retry for transfers, idempotency replay/conflict/release, EMF, log-store failure, admin API, review W3 |
| U3 | `test/gateway/helpers.test.ts` | API key comparison, retry classification, backoff, stats, ids, secret cache |
| U6 | `test/gateway/ai-mapping.test.ts` | Req 1.1–1.6 with a fake model: path checks, invented paths flagged, draft with `items`, preview, bad samples never reach the model, model failure |

## 2. Infrastructure
`npm run synth`: clean. IAM review of the synthesized template: each function gets only its table and its own secrets; the gateway gets `bedrock:InvokeModel` on one inference profile and three regional ARNs of one model. The only `*` is CDK's own `cloudfront:CreateInvalidation` for the dashboard deployment helper (CloudFront does not support resource-level permissions for it).

## 3. Deployed smoke test (`scripts/smoke.sh`, AWS us-east-1)
11/11 passed: health; 401 without key; balance REST→SOAP→REST with `availableBalance: 50000`; unknown account → 404; history; transfer; transfer replay identical; credit score SOAP→REST→SOAP with `RiskGrade B`; chaos injection; recovery after 2 injected failures; admin stats.

## 4. Dashboard (functional DOM run, jsdom against CloudFront + live API)
A headless Chromium could not start (missing system library `libatk-1.0`), so the dashboard was run in jsdom with real `fetch` against the deployed stack. **20/20 checks with the AI tab (19/19 without), no page errors**: connect; KPIs; 30-bar chart; tab switching; balance; four-stage flow; masking in the UI; failure injection; recovery shown as 3 attempts; Idempotency-Key field; transfer; idempotent replay badge; SOAP credit score; 404 fault; studio both stages reproducing the proposal JSON; integrations; **AI mapping from Bedrock (9 suggestions, 9 verified, ~2.6 s)**; recent requests; request detail. CORS preflight from the CloudFront origin returns the allowed origin and headers.

**Not verified**: visual layout in a real browser, screen-reader behaviour. The presenter should open the CloudFront URL once before the demo.

## 5. Bugs found and fixed during Construction
| Found by | Problem | Fix |
|---|---|---|
| Test 6.2/6.3 | Request ids collided when tests stubbed `Math.random` | Ids use `crypto.randomInt` for the suffix |
| Test 6.2/6.3 | Test helper put the query string in the path | Helper splits path and query as the adapters do |
| AI test 1.1 | A single repeating XML element looked like an object | Test sample has two elements; real samples should too (noted in the AI tab hint) |
| Local run | Missing dashboard file crashed the local server | Local server catches per-request errors |
| Reviewer W3, W4 | See [review-report.md](review-report.md) | Fixed and redeployed |
