# Design: U1 Transformation Engine

Contracts: `aidlc/.../inception/contract-design/contract-summary.md` sections 2–4. Decisions: ADR-002, ADR-003, ADR-004.

## Modules (`bridgex/src/transform/`, `bridgex/src/config/`)
| Module | Exports | Notes |
|---|---|---|
| `errors.ts` | `BridgeError(code, message, status, details?)` | Single error type carried through the pipeline |
| `xml.ts` | `parseXml(text)`, `buildXml(obj)`, `MAX_PAYLOAD_BYTES` | `fast-xml-parser` v5. Parser: `removeNSPrefix`, `parseTagValue:false`, attributes as `@_x`. Rejects DOCTYPE/ENTITY before parsing (the parser would expand internal entities; verified in a probe). Builder escapes values. |
| `soap.ts` | `buildSoapRequest`, `buildSoapResponse`, `buildSoapFault`, `parseSoap` | Prefix `soapenv` for the envelope, `ns` for the operation namespace, `wsse` for WS-Security |
| `paths.ts` | `getPath`, `setPath` | Dot paths; numeric segments index arrays |
| `convert.ts` | `convertValue(value, rule)`, `formatDate` | Types, dates, lookup |
| `mapping.ts` | `applyMappings(source, rules, {prefix?})` → `{output, errors}` | `prefix` adds `ns:` to every output key for SOAP bodies |
| `validate.ts` | `validatePayload(source, schema)` → `string[]` | Paths are source paths |
| `mask.ts` | `createMasker(sensitive[], secrets[])` → `(text) => text`, `collectSensitive` | Longest values first so prefixes don't leave fragments |
| `engine.ts` | `transformRequest`, `transformResponse`, `previewTransform` | Direction-aware, see below |
| `config/types.ts` | `Integration`, `MappingRule`, `FieldSchema`, ... | Single source for the document shape |
| `config/registry.ts` | `createRegistry(docs, env)` → `{ list, get, matchRest, matchSoap, publicView }` | Validates and resolves placeholders |
| `config/integrations/*.json` | Four integrations | `account-balance`, `transaction-history`, `fund-transfer`, `credit-score` |

## Engine functions
```ts
transformRequest(integration, clientBody: string) → { downstreamBody: string, contentType, sourceDoc, mappedDoc, soapOperation? }
transformResponse(integration, downstreamBody: string, downstreamStatus) → { clientBody: string, contentType, mappedDoc } | throws BridgeError (fault)
```
- `rest-to-soap` request: `JSON.parse` → validate → map with prefix `ns` → `buildSoapRequest(target, body, wsSecurity?)`. WS-Security credentials are added by the gateway, not the engine, so preview shows `[masked]`.
- `rest-to-soap` response: `parseSoap` → if fault, throw `BridgeError` with the fault's `ErrorCode` → else map `Body[responseElement]` to JSON.
- `soap-to-rest` request: `parseSoap` → check operation → validate operation content → map → `JSON.stringify`.
- `soap-to-rest` response: `JSON.parse` → map with prefix `ns` → `buildSoapResponse(route.soapNamespace, responseElement, body)`.

## Error handling
`BridgeError` codes follow the contract table. The engine never includes raw parser messages in the client-facing `message`; details hold only path-level reasons.

## Testing strategy
Golden examples for each of the four integrations in both stages, using the `samples` in each document; the proposal's balance example as an exact-match test; unit tests for parser safety, escaping, fault parsing, every mapping feature and validator rule; registry tests for placeholder resolution and invalid documents.
