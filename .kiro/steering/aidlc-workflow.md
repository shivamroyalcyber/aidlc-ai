---
inclusion: always
---
# AI-DLC Workflow Rules

This workspace follows the AWS AI-Driven Development Life Cycle (AI-DLC 2.x method, https://github.com/awslabs/aidlc-workflows). The AI proposes and builds. A human approves every gate.

## Where the record lives
- Active intent: `aidlc/spaces/default/intents/261120-bridgex-mvp/`
- `aidlc-state.md` is the single source of truth for progress. Read it at the start of every session and update it when a stage changes state.
- `audit/kiro-workshop.md` is the append-only audit trail. Never edit or delete earlier entries.
- Phase folders: `ideation/`, `inception/`, `construction/`, `operation/`, `verification/`.
- Per-unit construction specs live in `.kiro/specs/<unit>/` (`requirements.md` = functional spec, `design.md` = functional and NFR design, `tasks.md` = code generation plan).

## Phases
0 Initialization → 1 Ideation → 2 Inception → 3 Construction → 4 Operation. The route for this intent is in `aidlc-state.md` (profile `mvp`, composed with three Operation stages).

## Gates
- A stage moves `[ ]` → `[-]` → `[?]` → `[x]`. Only a human reply moves `[?]` to `[x]`. Record the reply in the audit log.
- Do not start Code Generation for a unit until its spec (`requirements.md`, `design.md`, `tasks.md`) is approved.
- If the human delegates approvals, record the delegation as a `DECISION_RECORDED` entry with their words, and keep the final demo-readiness gate open for them.

## Audit entries
Append one block per event, oldest first, UTC timestamps:
```
## <Title>
**Timestamp**: 2026-11-20T08:31:08Z
**Event**: STAGE_STARTED | STAGE_COMPLETED | GATE_OPENED | GATE_APPROVED | QUESTION_ANSWERED | DECISION_RECORDED | ARTIFACT_CREATED | TEST_RUN | DEPLOYMENT | NOTE
**Stage**: <stage-slug>
**Agent**: <kiro agent or role>
**Details**: <one or two sentences>
**Person Reply**: <the person's words, if any>
**Git Name**: <git config user.name, for human decisions>
---
```

## Secrets in the record
Mask anything shaped like a key, token or password before writing it to any file, including the audit log: write `[masked]`. Never copy AWS credentials from chat into the workspace.

## Traceability
Every task in `tasks.md` names the requirement IDs it covers (`FR-xx`, `NFR-xx`, or the spec's own numbered criteria). Every test file names the requirement it checks in its `describe` title.
