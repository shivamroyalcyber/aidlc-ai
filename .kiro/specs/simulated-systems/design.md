# Design: U2 Simulated Systems

ADR-009: the simulators run behind their own HTTP API so the gateway makes real HTTPS calls.

## Modules (`bridgex/src/simulators/`)
| Module | Responsibility |
|---|---|
| `data.ts` | Seed accounts (`ACC101`–`ACC104`), transactions per account, customers (`CUST1001`–`CUST1003`) |
| `core-banking.ts` | `createCoreBanking(deps)` → `(req) => res`. Parses the envelope with U1 `parseSoap`, checks the UsernameToken, dispatches the operation, builds responses and faults with U1 builders |
| `fintech.ts` | `createFintech(deps)` → `(req) => res`. Bearer check, credit score lookup |
| `app.ts` | `createSimulatorsApp(deps)` routes `/core-banking/*` and `/fintech/*`, applies chaos, returns 404 otherwise |
| `lambda.ts` | API Gateway v2 adapter; reads credentials from Secrets Manager; DynamoDB chaos store |

## Dependencies (injected)
```ts
interface SimulatorDeps {
  credentials(): Promise<{ coreBankingUsername; coreBankingPassword; fintechToken }>;
  chaos: ChaosStore;        // consume(target) → mode | null; set(target, mode, count); get()
  sleep(ms): Promise<void>; // fake in tests
  now(): Date;
  random(): number;
}
```
The `ChaosStore` interface is shared with the gateway (U3), which sets chaos through `/admin/chaos`. DynamoDB implementation: `UpdateItem SET remaining = remaining - 1 WHERE remaining > 0`, `ReturnValues: ALL_NEW`; a failed condition means no chaos.

## Transfers
Stateless: the simulator checks funds against seed balances and returns a reference `TXN` + time-ordered digits. Balances are not changed, which keeps the demo repeatable. The gateway's idempotency (U3) is what prevents duplicates.

## Testing strategy
`test/simulators/core-banking.test.ts` and `fintech.test.ts` call the handlers in-process with fake credentials, an in-memory chaos store and a no-op sleep.
