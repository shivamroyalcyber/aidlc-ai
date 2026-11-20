---
inclusion: always
---
# Structure

```
/workshop
├── .kiro/
│   ├── steering/         # these rules
│   ├── specs/<unit>/     # requirements.md, design.md, tasks.md per unit of work
│   ├── agents/           # spec, build, reviewer, ops
│   └── hooks/            # automation (audit reminders, checks, guards)
├── aidlc/spaces/default/intents/261120-bridgex-mvp/   # AI-DLC record: state, audit, phase artifacts
└── bridgex/
    ├── src/
    │   ├── transform/    # U1: xml.ts, soap.ts, mapping.ts, validate.ts, mask.ts, engine.ts
    │   ├── config/       # U1: types.ts, registry.ts, integrations/*.json
    │   ├── gateway/      # U3 + U6: app.ts, pipeline.ts, admin.ts, retry.ts, http-client.ts, stores, ai-mapping.ts, lambda.ts
    │   ├── simulators/   # U2: core-banking.ts, fintech.ts, data.ts, lambda.ts
    │   └── shared/       # http types, ids, small helpers
    ├── test/             # Vitest tests, mirrors src/
    ├── dashboard/        # U5: index.html, app.js, styles.css
    ├── infra/            # U4: bin/app.ts, lib/bridgex-stack.ts
    └── scripts/          # local-server.ts, smoke.sh, show-api-key.sh
```

The old `idea-board/` folder is a separate, unrelated repository. Do not change it.
