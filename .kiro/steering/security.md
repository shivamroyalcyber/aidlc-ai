---
inclusion: fileMatch
fileMatchPattern: 'bridgex/{src,infra}/**/*.ts'
---
# Security rules for BridgeX code

This is banking middleware. Apply these rules to every change in `bridgex/src/` and `bridgex/infra/`.

- Validate every client payload at the gateway before any downstream call (size, parse, schema).
- XML: reject `<!DOCTYPE` and `<!ENTITY`, never expand entities, cap input at 64 KB. Build XML only through the builder in `src/transform/xml.ts` so values are escaped.
- Secrets: read from Secrets Manager through `src/gateway/secrets.ts`. Never log, return or hardcode them. Never put them in environment variables; pass only the secret ARN.
- Logs and request records: mask `sensitive` mapping values and downstream credentials with `src/transform/mask.ts` before storing or logging.
- Compare API keys in constant time.
- Retries: only for integrations with `idempotent: true`. Never retry a SOAP fault.
- IAM: grant each function only its own table, secrets and model. No `*` resources except where the service requires it, and say why in a comment.
- Errors to clients: use the error model. No stack traces, no downstream URLs, no raw exception text.
