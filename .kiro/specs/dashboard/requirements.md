# Requirements Document: U5 Dashboard

## Introduction
The dashboard is the stage for the demo. It shows what BridgeX is doing and lets the presenter drive every scenario from one screen. It is a static site with no build step (ADR-010). Source requirements: FR-14 to FR-18, US-06 to US-09.

## Requirements

### Requirement 1: Connection
1. The dashboard SHALL read the gateway URL from `config.json` next to `index.html`, and SHALL let the user override it.
2. The dashboard SHALL ask for the API key, keep it in `sessionStorage` only, and send it as `x-api-key`.
3. WHEN a call returns 401 THEN the dashboard SHALL say the key is wrong and show the key form.

### Requirement 2: Overview
1. The Overview SHALL show total requests, success rate, failures, average and p95 latency, retried requests and requests recovered by retry.
2. The Overview SHALL show a per-integration table and a per-minute bar chart for the last 30 minutes.
3. The Overview SHALL list recent requests (time, integration, status, latency, attempts) and refresh every 5 seconds while visible.
4. WHEN a request row is selected THEN the dashboard SHALL show its four stages side by side (client request → downstream request → downstream response → client response) and its Attempts.

### Requirement 3: Playground
1. The Playground SHALL offer one preset per integration, prefilled from the integration's request sample, and SHALL send it to the integration's route.
2. For integrations that need it, the Playground SHALL generate an `Idempotency-Key` and let the user resend with the same key.
3. After a call, the Playground SHALL show the client response and the transformation flow for that request id.
4. The Playground SHALL offer failure injection buttons: fail next 2 calls (recoverable), fail next 5 calls (outage), slow next call (timeout), and clear.

### Requirement 4: Transformation Studio
1. The Studio SHALL let the user pick an integration and a stage (request or response), edit a dummy payload prefilled from the samples, and show the transformed output from `/admin/transform-preview`.

### Requirement 5: AI Mapping
1. The AI Mapping tab SHALL accept a source and a target sample with their formats, call `/admin/mapping-suggestions`, and show each suggestion with confidence, reason and validity, plus the draft JSON.
2. The tab SHALL tell the user to paste dummy data only.

### Requirement 6: Integrations
1. The Integrations tab SHALL list each integration's route, direction, target, retry policy and mapping rules.

### Requirement 7: Accessibility and safety
1. Controls SHALL be native elements with visible labels; tabs SHALL use `role="tab"` and `aria-selected`.
2. Payload text from the API SHALL be inserted with `textContent`, never as HTML.
