#!/usr/bin/env bash
# Smoke test for a deployed (or local) BridgeX gateway.
#   scripts/smoke.sh <gateway-url> <api-key>
# Exits non-zero on the first failed check.
set -euo pipefail

URL="${1:?usage: smoke.sh <gateway-url> <api-key>}"
KEY="${2:?usage: smoke.sh <gateway-url> <api-key>}"
URL="${URL%/}"
PASS=0

check() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
    printf '  ok   %-58s HTTP %s\n' "$name" "$actual"
  else
    printf '  FAIL %-58s expected %s, got %s\n%s\n' "$name" "$expected" "$actual" "$body"
    exit 1
  fi
}

call() { # method path content-type body [extra header]
  local out
  out=$(curl -sS -o /tmp/bridgex-smoke.body -w '%{http_code}' -X "$1" "$URL$2" -H "content-type: $3" -H "x-api-key: $KEY" ${5:+-H "$5"} --data-binary "$4")
  echo "$out"
}

echo "BridgeX smoke test against $URL"

code=$(curl -sS -o /tmp/bridgex-smoke.body -w '%{http_code}' "$URL/health")
check "health" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"

code=$(curl -sS -o /tmp/bridgex-smoke.body -w '%{http_code}' -X POST "$URL/api/v1/accounts/balance" -H 'content-type: application/json' -d '{"accountId":"ACC101"}')
check "balance without API key is rejected" 401 "$code" "$(cat /tmp/bridgex-smoke.body)"

code=$(call POST /api/v1/accounts/balance application/json '{"accountId":"ACC101"}')
check "balance REST -> SOAP -> REST" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"
grep -q '"availableBalance":50000' /tmp/bridgex-smoke.body || { echo "  FAIL balance body: $(cat /tmp/bridgex-smoke.body)"; exit 1; }

code=$(call POST /api/v1/accounts/balance application/json '{"accountId":"ACC999"}')
check "unknown account: SOAP fault -> 404" 404 "$code" "$(cat /tmp/bridgex-smoke.body)"

code=$(call POST /api/v1/accounts/transactions application/json '{"accountId":"ACC101","fromDate":"2026-11-01","toDate":"2026-11-20","limit":3}')
check "transaction history (dates, codes, arrays)" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"

KEY_ID="smoke-$(date +%s)"
code=$(call POST /api/v1/transfers application/json '{"fromAccountId":"ACC101","toAccountId":"ACC102","amount":10}' "idempotency-key: $KEY_ID")
check "transfer with Idempotency-Key" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"
first=$(cat /tmp/bridgex-smoke.body)
code=$(call POST /api/v1/transfers application/json '{"fromAccountId":"ACC101","toAccountId":"ACC102","amount":10}' "idempotency-key: $KEY_ID")
check "transfer replay returns the stored result" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"
[[ "$(cat /tmp/bridgex-smoke.body)" == "$first" ]] || { echo "  FAIL replay body differs"; exit 1; }

SOAP='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ln="http://legacybank.example.com/loans"><soapenv:Body><ln:GetCreditScore><ln:CustomerId>CUST1001</ln:CustomerId><ln:LoanAmount>500000</ln:LoanAmount></ln:GetCreditScore></soapenv:Body></soapenv:Envelope>'
code=$(call POST /soap/v1/LoanService 'text/xml; charset=utf-8' "$SOAP")
check "credit score SOAP -> REST -> SOAP" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"
grep -q '<ns:RiskGrade>B</ns:RiskGrade>' /tmp/bridgex-smoke.body || { echo "  FAIL credit score body: $(cat /tmp/bridgex-smoke.body)"; exit 1; }

code=$(call POST /admin/chaos application/json '{"target":"core-banking","mode":"error","count":2}')
check "inject 2 failures into core banking" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"
code=$(call POST /api/v1/accounts/balance application/json '{"accountId":"ACC102"}')
check "balance recovers after retries" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"

code=$(curl -sS -o /tmp/bridgex-smoke.body -w '%{http_code}' "$URL/admin/stats" -H "x-api-key: $KEY")
check "admin stats" 200 "$code" "$(cat /tmp/bridgex-smoke.body)"

rm -f /tmp/bridgex-smoke.body
echo "All $PASS checks passed."
