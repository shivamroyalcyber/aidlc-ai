# Units of Work

**Stage**: 2.7 Units Generation
**Lead role**: architect, supported by delivery

| Unit | Purpose | Kiro spec | Code |
|---|---|---|---|
| U1 `transformation-engine` | XML/SOAP handling, mapping, validation, masking. Pure functions. | [.kiro/specs/transformation-engine](../../../../../../../.kiro/specs/transformation-engine/) | `bridgex/src/transform/`, `bridgex/src/config/` |
| U2 `simulated-systems` | SOAP core banking and REST FinTech simulators with failure injection | [.kiro/specs/simulated-systems](../../../../../../../.kiro/specs/simulated-systems/) | `bridgex/src/simulators/` |
| U3 `gateway` | Request pipeline, auth, downstream calls, retry, idempotency, request log, admin API, local server | [.kiro/specs/gateway](../../../../../../../.kiro/specs/gateway/) | `bridgex/src/gateway/`, `bridgex/scripts/` |
| U4 `platform-infra` | CDK stack, secrets, CloudFront, CloudWatch dashboard and alarm | [.kiro/specs/platform-infra](../../../../../../../.kiro/specs/platform-infra/) | `bridgex/infra/` |
| U5 `dashboard` | Operator web UI | [.kiro/specs/dashboard](../../../../../../../.kiro/specs/dashboard/) | `bridgex/dashboard/` |
| U6 `ai-mapping-assistant` | Bedrock mapping suggestions | [.kiro/specs/ai-mapping-assistant](../../../../../../../.kiro/specs/ai-mapping-assistant/) | `bridgex/src/gateway/ai-mapping.ts` |

Dependencies: [unit-of-work-dependency.md](unit-of-work-dependency.md). Story coverage: [unit-of-work-story-map.md](unit-of-work-story-map.md).
