# Requirements Document: U1 Transformation Engine

## Introduction
The transformation engine is the core of BridgeX. It turns JSON into SOAP/XML and SOAP/XML into JSON using declarative integration documents. It is a set of pure TypeScript functions with no AWS dependencies, used by the gateway (U3), the simulators (U2) and the transform preview. Source requirements: FR-01 to FR-08, FR-15, NFR-01, NFR-06 in `aidlc/spaces/default/intents/261120-bridgex-mvp/inception/requirements-analysis/requirements.md`.

## Glossary
- **Integration**: A JSON document describing one route, its target and its request and response mappings (contract section 2).
- **Mapping_Rule**: One `from` → `to` instruction with optional type conversion, formats, lookup, default, required, sensitive, items or array.
- **Envelope**: A SOAP 1.1 `Envelope` with `Header` and `Body`.
- **Fault**: A SOAP 1.1 `Body/Fault` element with `faultcode`, `faultstring` and optional `detail`.
- **Registry**: The loaded, validated set of Integrations.

## Requirements

### Requirement 1: Safe XML parsing
**User Story:** As a security owner, I want XML input handled safely, so that the gateway cannot be attacked through XML. (NFR-01)
#### Acceptance Criteria
1. WHEN XML input contains `<!DOCTYPE` or `<!ENTITY` THEN the engine SHALL reject it with error code `INVALID_PAYLOAD` before parsing.
2. WHEN input is larger than 64 KB THEN the engine SHALL reject it with error code `PAYLOAD_TOO_LARGE`.
3. WHEN XML is not well formed THEN the engine SHALL reject it with error code `INVALID_PAYLOAD`.
4. The parser SHALL remove namespace prefixes and keep all element values as strings.
5. WHEN the engine builds XML THEN it SHALL escape `&`, `<`, `>`, `"` and `'` in values.

### Requirement 2: SOAP envelopes and faults
**User Story:** As an integration developer, I want SOAP envelopes built and read correctly, so that legacy services accept BridgeX requests. (FR-01, FR-04, FR-08)
#### Acceptance Criteria
1. WHEN building a request THEN the engine SHALL produce a SOAP 1.1 Envelope with the operation element in the target namespace under a fixed prefix, and an optional WS-Security UsernameToken header.
2. WHEN reading an Envelope THEN the engine SHALL return the header, the name of the first Body element and its content, whatever prefixes the sender used.
3. WHEN the Body holds a Fault THEN the engine SHALL return `faultcode`, `faultstring` and the first `ErrorCode` and `ErrorMessage` found under `detail`.
4. WHEN the input is not an Envelope THEN the engine SHALL return error code `INVALID_PAYLOAD`.
5. The engine SHALL build a Fault envelope from a code, message and detail fields.

### Requirement 3: Declarative mapping
**User Story:** As an integration developer, I want field mappings in configuration, so that a new integration needs no code. (FR-05)
#### Acceptance Criteria
1. The engine SHALL read `from` and write `to` using dot paths, creating nested objects as needed.
2. WHEN `type` is `number`, `integer`, `boolean` or `string` THEN the engine SHALL convert the value, and SHALL report an error naming the path if conversion fails.
3. WHEN `type` is `date` THEN the engine SHALL convert between `iso` (`YYYY-MM-DD`), `yyyyMMdd` and `ddMMyyyy`, and SHALL report invalid dates.
4. WHEN `lookup` is set THEN the engine SHALL replace a matching value with the lookup result and keep other values unchanged.
5. WHEN the source value is missing THEN the engine SHALL use `default` if set, report an error if `required` is set, and otherwise omit the field.
6. WHEN `items` is set THEN the engine SHALL treat the source as an array (a single object becomes a one-element array) and map each element with `items`.
7. WHEN `array` is set THEN the engine SHALL treat the source as an array of primitive values and convert each.
8. WHEN a source node is an XML element with attributes THEN the engine SHALL use its text content.

### Requirement 4: Schema validation
**User Story:** As an app developer, I want clear validation errors, so that I can fix my request. (FR-07)
#### Acceptance Criteria
1. The engine SHALL check `required`, `type`, `pattern`, `minLength`, `maxLength`, `min`, `max` and `enum` for each schema path.
2. WHEN validation fails THEN the engine SHALL return every failing path with a short reason.

### Requirement 5: Integration registry
**User Story:** As an integration developer, I want broken configuration caught early, so that bad mappings never reach production. (FR-06, NFR-06)
#### Acceptance Criteria
1. The Registry SHALL validate each Integration at load and SHALL throw an error naming the integration and the problem.
2. The Registry SHALL replace `${NAME}` placeholders in target URLs from the supplied environment, and SHALL throw if a placeholder has no value.
3. The Registry SHALL find a REST Integration by method and path, and a SOAP Integration by path and SOAP operation.
4. The Registry SHALL return a public view of each Integration with no secrets.

### Requirement 6: End-to-end transformation and preview
**User Story:** As an integration developer, I want to run one stage of a transformation on dummy data, so that I can check a mapping without a downstream call. (FR-01 to FR-04, FR-15)
#### Acceptance Criteria
1. For `rest-to-soap`, the engine SHALL turn client JSON into a SOAP request, and a SOAP response into client JSON.
2. For `soap-to-rest`, the engine SHALL turn a client SOAP request into JSON, and a JSON response into a SOAP response envelope.
3. WHEN given the proposal's balance example THEN the engine SHALL produce exactly `{"accountId":"ACC101","availableBalance":50000,"currency":"INR"}`.
4. The transform preview SHALL accept `stage` `request` or `response` and return the output text, its content type and any errors.

### Requirement 7: Masking
**User Story:** As a compliance officer, I want sensitive values hidden in logs. (FR-13, NFR-01)
#### Acceptance Criteria
1. The engine SHALL collect values of rules marked `sensitive` from the source and target documents.
2. The masker SHALL replace each sensitive value in a text with `***` plus its last three characters, and each secret with `********`.
