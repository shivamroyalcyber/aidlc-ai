# Requirements Document: U6 AI Mapping Assistant

## Introduction
Writing field mappings by hand is the slowest part of a new integration. U6 asks Amazon Bedrock to propose mappings between a sample source payload and a sample target payload, checks every proposal against the samples, and returns a draft for a human to review. It never changes configuration. Source requirement: FR-18; decision ADR-008.

## Requirements

### Requirement 1: Suggest mappings
**User Story:** As an integration developer, I want a first draft of the mapping rules, so that I don't start from a blank file. (US-07)
#### Acceptance Criteria
1. WHEN `POST /admin/mapping-suggestions` receives a source and a target, each with `format` `json` or `xml` and a `sample` up to 16 KB, THEN U6 SHALL call the Bedrock Converse API with a forced `propose_mappings` tool.
2. Each suggestion SHALL contain `from`, `to`, optional `type`, `sourceFormat`, `targetFormat`, `lookup`, plus `confidence` (0–1) and a short `reason`.
3. U6 SHALL check that each `from` path exists in the parsed source sample and each `to` path exists in the parsed target sample, and SHALL mark failing suggestions `valid: false` with the reason.
4. U6 SHALL return `suggestions`, a `draft` array of valid rules in integration-document form, and `unmappedTargets` (leaf paths in the target with no valid suggestion).
5. WHEN either sample does not parse THEN U6 SHALL return 400 `INVALID_PAYLOAD` without calling Bedrock.
6. WHEN Bedrock fails or returns no tool call THEN U6 SHALL return 502 `AI_UNAVAILABLE`.

### Requirement 2: Safety
1. U6 SHALL NOT write or apply any configuration.
2. The model ID SHALL come from configuration (`BEDROCK_MODEL_ID`), and IAM SHALL allow only that model.
3. The dashboard SHALL tell the user to paste dummy data only.
