# Demo Runbook: BridgeX (about 8 minutes + Q&A)

This is the artifact for the open **demo-readiness** gate. Rehearse it once against AWS, then approve or ask for changes.

## Before you present (5 minutes)
1. In a terminal: `source ~/.bridgex-aws-env && cd /workshop/bridgex && scripts/show-api-key.sh` to read the API key. Don't paste it into slides or files.
   If the credentials have expired, ask the AWS team for fresh ones and update `~/.bridgex-aws-env`.
2. Open https://dx6gjz51ih1ul.cloudfront.net, paste the key, click **Connect**. You should see "Connected · 4 integrations".
3. Playground → failure injection → **Clear**, for both systems.
4. Open the CloudWatch dashboard `BridgeX-Operations` in a second tab (us-east-1).
5. Open Kiro with `aidlc/spaces/default/intents/261120-bridgex-mvp/aidlc-state.md` and the `.kiro/` folder visible.
6. **Plan B** if AWS or Wi-Fi fails: `cd bridgex && npm run local`, open http://localhost:3000, key `printed in the terminal`. Everything except AI mapping works offline. AI works locally too with `BRIDGEX_LOCAL_BEDROCK=1` and AWS credentials.

## The story (say this in 30 seconds)
"Banks run core systems that speak SOAP and XML. Their new mobile apps, FinTech partners and AI services speak REST and JSON. Today every connection is custom code. BridgeX is one serverless gateway on AWS that translates both ways from configuration, so the core system never changes and its credentials never leave the gateway."

## Live demo
| # | Show | Click | Point out |
|---|---|---|---|
| 1 | The proposal example, live | Playground → *Account balance inquiry* → **Send** | JSON in, `availableBalance: 50000` as a **number** out. Scroll to *What BridgeX did*: four stages, the real SOAP envelope with a WS-Security header, password shown as `********`, account as `***101` |
| 2 | It's configuration, not code | Integrations tab → *Transaction history* | Mapping rules: `yyyyMMdd` → ISO date, `CR/DR` → `credit/debit`, repeating `<Transaction>` → JSON array. Then Playground → *Transaction history* → Send |
| 3 | Legacy → modern direction | Playground → *Credit score for loan origination* → Send | A SOAP request from a legacy loan system becomes REST + Bearer token to a FinTech API, and the JSON answer comes back as SOAP (`RiskGrade B`) |
| 4 | Business errors stay meaningful | Scenario *Balance: unknown account* → Send | SOAP fault `ACCOUNT_NOT_FOUND` becomes HTTP 404 with a clean JSON error, no stack trace |
| 5 | Reliability | System = Core Banking → **Fail next 2 calls** → Account balance → Send | Response still 200, chip shows **attempts 3**; flow shows `http-error 503`, `503`, `ok`. Overview: *Recovered 1* |
| 6 | Outage and monitoring | **Fail next 5 calls** → Send twice | Clean `503 DOWNSTREAM_UNAVAILABLE` after 3 attempts. Overview chart turns red; CloudWatch tab shows failures and retries per integration (metrics arrive within about a minute) |
| 7 | Money is never moved twice | **Clear** → *Fund transfer* → Send, then Send again with the same key | Second answer is identical, badge **idempotent replay**, core banking was not called again. Transfers are never auto-retried (ADR-006) |
| 8 | Transformation Studio | Studio → *Account balance* → Response → **Transform** | Paste any dummy SOAP response and see the JSON, without calling any system. This is what the user meant by "dummy XML requests and responses" |
| 9 | AI-assisted mapping (the differentiator) | AI Mapping → **Load example** → **Suggest mappings** | Amazon Bedrock (Claude Haiku 4.5) proposes 9 rules in about 3 s, including `ddMMyyyy → iso`, `Y → true`, and the repeating instalments as `items`. Every path is **verified** against the samples; the draft is never applied automatically |

## How we built it with AI-DLC (2 minutes, show files in Kiro)
| Show | File | Say |
|---|---|---|
| The lifecycle state | `aidlc/.../aidlc-state.md` | Five phases, every stage with its checkbox; the last gate is waiting on a human |
| Audit trail | `aidlc/.../audit/kiro-workshop.md` | Every human decision with my words, credentials masked, every stage, test run and deployment with timestamps |
| Inception | `inception/requirements-analysis/requirements.md`, `domain-design/decisions.md` | 20 FRs, 7 NFRs, 10 stories, 10 ADRs, contracts, before any code |
| Units as Kiro specs | `.kiro/specs/<unit>/` | Six units, each with requirements (EARS), design and tasks traced to requirement IDs |
| Steering | `.kiro/steering/` | AI-DLC rules, product, tech, structure, plus a security rule set that loads only for gateway and infra code |
| Agents = AI-DLC roles | `.kiro/agents/` | `aidlc` orchestrator, `spec` (product/architect), `build` (developer), `reviewer` (quality/devsecops, read-only), `ops` (aws-platform, cannot delete) |
| Hooks = guardrails | `.kiro/hooks/` | Blocks credentials in files, asks before destructive AWS commands, typecheck on save, tests after every spec task, audit reminder on every prompt |
| Evidence | `construction/build-and-test/` | 105 tests; independent review found 4 warnings, 3 fixed and redeployed within minutes; 11/11 smoke checks on AWS |

## Likely questions
- **Why not API Gateway mapping templates?** They reshape JSON but don't handle SOAP envelopes, namespaces, faults or WS-Security (ADR-001, feasibility.md).
- **Performance?** Gateway overhead is tens of milliseconds on a warm Lambda; the request log shows gateway vs downstream latency per request.
- **Security?** API key compared in constant time; downstream credentials only in Secrets Manager; XXE and entity attacks rejected; values escaped; sensitive fields masked before storage; least-privilege IAM, including Bedrock limited to one model.
- **Adding a new integration?** One JSON file plus samples; the test suite transforms the samples, so a broken mapping fails before deploy. The AI tab drafts it.
- **What's next?** WSDL import, a runtime config store with approvals, JWT/OAuth clients, SOAP 1.2.

## After the demo
Approve the gate in chat ("demo-readiness approved"). To stop costs later, a person runs `npx cdk destroy BridgeXStack` from `bridgex/`.
