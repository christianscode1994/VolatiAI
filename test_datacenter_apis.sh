#!/bin/bash
# Test data-center APIs from Cloudflare Workers egress
# Each URL is proxied through a one-off worker if you have one, OR
# we rely on curl with a Workers-equivalent User-Agent to approximate.

UA="VolatiAI/1.0 (christianscode1994@gmail.com)"
TIMEOUT=15

test_endpoint() {
  local name="$1" url="$2"
  printf '%-28s ' "$name"
  code=$(curl -sfL --max-time "$TIMEOUT" -A "$UA" -o /tmp/dc_test_body -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  size=$(wc -c < /tmp/dc_test_body 2>/dev/null | tr -d ' ')
  body=$(head -c 80 /tmp/dc_test_body 2>/dev/null | tr -d '\n')
  echo "HTTP=$code size=${size}B ${body:0:60}"
}

echo "=== Tier 1 ==="
test_endpoint "peeringdb-facilities"    "https://www.peeringdb.com/api/fac?limit=1"
test_endpoint "peeringdb-exchanges"     "https://www.peeringdb.com/api/ix?limit=1"
test_endpoint "geocables-incidents"     "https://geocables.com/api/v1/incidents"
test_endpoint "downstatus-outages"      "https://isitdownstatus.com/api/v1/outages"

echo ""
echo "=== Tier 2 ==="
test_endpoint "dchub-playground"        "https://dchub.cloud/api/v1/facilities?limit=1"
test_endpoint "datacenter-computer"     "https://datacenter.computer/api/facilities?limit=1"
test_endpoint "outagedeck-vendors"      "https://outagedeck.com/api/v1/vendors?limit=1"
test_endpoint "prismix-ai-status"       "https://prismix.dev/status"

echo ""
echo "=== Interpretation ==="
echo "HTTP=200  → works from curl; needs Workers test to confirm"
echo "HTTP=000  → network/DNS fail (unlikely)"
echo "HTTP=403  → WAF block — likely dead from Workers"
echo "HTTP=404  → wrong endpoint — skip"
echo "HTML body → WAF challenge page — dead from Workers"
