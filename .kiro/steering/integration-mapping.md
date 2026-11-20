---
inclusion: fileMatch
fileMatchPattern: 'bridgex/src/config/integrations/*.json'
---
# Writing an integration document

Each file in `bridgex/src/config/integrations/` is one integration. The schema is in `bridgex/src/config/types.ts` and section 2 of `contract-summary.md`.

Checklist for a new or changed integration:
1. `id` is kebab-case and matches the file name.
2. `direction` is `rest-to-soap` or `soap-to-rest`. For `soap-to-rest`, the route also sets `soapOperation`, `soapNamespace` and `responseElement`.
3. Target URLs use placeholders (`${CORE_BANKING_URL}`, `${FINTECH_URL}`), never real hostnames.
4. Mark account numbers, customer IDs and similar fields `"sensitive": true` in both request and response mappings.
5. Set `idempotent` honestly. Anything that moves money is `false` with `"requireIdempotencyKey": true`.
6. Give every legacy fault code you know a `faults` entry with an HTTP status.
7. `samples.request` and `samples.response` are dummy data only. The test suite transforms both, so they must be valid.
8. Add or update the golden expectations in `bridgex/test/transform/engine.test.ts`.
9. Use the AI mapping assistant for a first draft if you like, but review every rule; suggestions are never applied automatically.
