# Design: U6 AI Mapping Assistant

## Module `bridgex/src/gateway/ai-mapping.ts`
```ts
suggestMappings(input, invoke: ModelInvoker) → SuggestionResult
type ModelInvoker = (system: string, user: string, toolSchema: object) => Promise<unknown /* tool input */>
bedrockInvoker(client: BedrockRuntimeClient, modelId) → ModelInvoker   // Converse + toolChoice {tool: propose_mappings}
```
- Parse both samples with U1 (`parseXml` for XML; SOAP envelopes are unwrapped to the first Body element so paths match integration documents).
- Flatten each sample to leaf paths (arrays collapse to their first element, written `Parent.Child[]`) and send the path lists plus the raw samples to the model.
- System prompt: the mapping rule vocabulary from the contract, "only use paths from the lists", "use lookup for code values", "dates: detect formats".
- Validate the tool output with a small hand-written checker (no extra schema library), then check paths against the leaf lists.
- `temperature: 0`, `maxTokens: 2000`.

## Model
`us.anthropic.claude-haiku-4-5-20251001-v1:0` (cross-region inference profile), verified working in the account on 2026-11-20. IAM: `bedrock:InvokeModel` on the inference profile ARN and the foundation model ARNs it routes to.

## Testing strategy
`test/gateway/ai-mapping.test.ts` with a fake `ModelInvoker`: valid proposals pass, a hallucinated path is flagged, a malformed tool output gives `AI_UNAVAILABLE`, bad samples never call the model.
