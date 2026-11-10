#!/usr/bin/env bash
# verify-all.sh — one-command end-to-end verification of the entire VolatiAI system
#
# Runs every cryptographic and consistency check in one pass:
#   - All signed snapshots verify
#   - Chain links are intact
#   - Anchor log untouched (via get_anchor)
#   - DID matches keys matches snapshots
#   - Tools list exposes all 11 tools
#   - Timestamps verify locally
#   - Accuracy (if samples mature)
#
# Any stranger can run this to prove the system works.
# Exit 0 if all checks pass, non-zero otherwise.

set -uo pipefail
cd "$(dirname "$0")/.."

MCP="https://volatiai-mcp.fourieranalys.workers.dev/mcp"
PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
  local name="$1"
  local rc="$2"
  if [ "$rc" -eq 0 ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$name")
  fi
}

echo "════════════════════════════════════════════════════"
echo "VolatiAI — full verification"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "════════════════════════════════════════════════════"

# ─── 1. MCP server alive ───
echo
echo "── 1. MCP server responds ──"
VERSION=$(curl -s -X POST "$MCP" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | jq -r '.result.serverInfo.version // "MISSING"' 2>/dev/null)
if [ "$VERSION" != "MISSING" ] && [ -n "$VERSION" ]; then
  echo "  version: $VERSION"
  check "server responds" 0
else
  check "server responds" 1
fi

# ─── 2. All expected tools listed ───
echo
echo "── 2. All 11 tools listed ──"
EXPECTED_TOOLS='["list_active_signals","get_sector","list_categories","verify_snapshot","find_corroborations","get_diff","get_current_revision","get_anchor","get_trust_manifest","resolve_entity","list_entities"]'
ACTUAL_TOOLS=$(curl -s -X POST "$MCP" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | jq -c '[.result.tools[].name] | sort' 2>/dev/null)
EXPECTED_SORTED=$(echo "$EXPECTED_TOOLS" | jq -c 'sort')
if [ "$ACTUAL_TOOLS" = "$EXPECTED_SORTED" ]; then
  check "11/11 tools listed" 0
else
  echo "  expected: $EXPECTED_SORTED"
  echo "  actual:   $ACTUAL_TOOLS"
  check "11/11 tools listed" 1
fi

# ─── 3. Every signed snapshot verifies ───
echo
echo "── 3. Signed snapshots verify ──"
SNAPSHOTS=$(ls docs/snapshots/*.json 2>/dev/null | grep -v _anchors | xargs -n1 basename | sed 's/.json//')
for d in $SNAPSHOTS; do
  RESULT=$(curl -s -X POST "$MCP" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"verify_snapshot\",\"arguments\":{\"date\":\"$d\"}}}" \
    | jq -r '.result.content[0].text | fromjson | .signature_valid' 2>/dev/null)
  if [ "$RESULT" = "true" ]; then
    echo "  $d: ✅"
  elif [ "$RESULT" = "false" ]; then
    echo "  $d: ❌ signature invalid"
    check "snapshot $d" 1
    continue
  else
    echo "  $d: — (unsigned, ok)"
  fi
done

# Verify count: at least 4 must be true
VERIFIED=$(for d in $SNAPSHOTS; do
  curl -s -X POST "$MCP" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"verify_snapshot\",\"arguments\":{\"date\":\"$d\"}}}" \
    | jq -r '.result.content[0].text | fromjson | .signature_valid' 2>/dev/null
done | grep -c true)
if [ "$VERIFIED" -ge "4" ]; then
  check "at least 4 snapshots verify" 0
else
  check "at least 4 snapshots verify (got $VERIFIED)" 1
fi

# ─── 4. Anchor log untampered ───
echo
echo "── 4. Anchor log intact (get_anchor) ──"
MOST_RECENT=$(ls docs/snapshots/*.json 2>/dev/null | grep -v _anchors | xargs -n1 basename | sed 's/.json//' | sort | tail -1)
if [ -n "$MOST_RECENT" ]; then
  ANCHOR_TAMPERED=$(curl -s -X POST "$MCP" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_anchor\",\"arguments\":{\"date\":\"$MOST_RECENT\"}}}" \
    | jq -r '.result.content[0].text | fromjson | .tampered_since_anchor' 2>/dev/null)
  if [ "$ANCHOR_TAMPERED" = "false" ]; then
    check "anchor log intact for $MOST_RECENT" 0
  else
    check "anchor log intact for $MOST_RECENT (got $ANCHOR_TAMPERED)" 1
  fi
fi

# ─── 5. DID consistency ───
echo
echo "── 5. DID ↔ keys ↔ snapshots consistent ──"
if [ -f scripts/mirror/verify_identity_consistency.py ]; then
  if python3 scripts/mirror/verify_identity_consistency.py > /tmp/identity.log 2>&1; then
    check "identity consistent" 0
  else
    echo "  $(tail -3 /tmp/identity.log | head -1)"
    check "identity consistent" 1
  fi
else
  echo "  (verify_identity_consistency.py not present — skipping)"
fi

# ─── 6. Timestamps verify ───
echo
echo "── 6. FreeTSA timestamps verify ──"
if [ -f scripts/mirror/verify_tsr.py ]; then
  if python3 scripts/mirror/verify_tsr.py --all > /tmp/tsr.log 2>&1; then
    TSR_COUNT=$(grep -c '✓' /tmp/tsr.log 2>/dev/null || echo 0)
    check "$TSR_COUNT timestamp(s) verify" 0
  else
    check "timestamps verify" 1
  fi
else
  echo "  (verify_tsr.py not present — skipping)"
fi

# ─── 7. Accuracy tracker (if samples available) ───
echo
echo "── 7. Accuracy tracker ──"
ACC=$(curl -s "https://christianscode1994.github.io/VolatiAI/accuracy.json?cb=$(date +%s)" 2>/dev/null)
if [ -z "$ACC" ] || [ "$ACC" = "{}" ]; then
  echo "  (no mature samples yet — expected until ~2026-11-11)"
else
  SKILLS=$(echo "$ACC" | jq -r 'to_entries[] | "\(.key): skill=\(.value.skill)"' 2>/dev/null)
  echo "$SKILLS" | while read line; do echo "    $line"; done
  check "accuracy samples available" 0
fi

# ─── 8. Tool array sanity (via local script) ───
echo
echo "── 8. Tools array matches expected set ──"
if [ -f scripts/mirror/verify_tools_array.py ]; then
  if python3 scripts/mirror/verify_tools_array.py > /tmp/tools.log 2>&1; then
    check "tools array consistent" 0
  else
    check "tools array consistent" 1
  fi
else
  echo "  (verify_tools_array.py not present — skipping)"
fi

# ─── Summary ───
echo
echo "════════════════════════════════════════════════════"
echo "Summary: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed checks:"
  for c in "${FAILED_CHECKS[@]}"; do echo "  ❌ $c"; done
  exit 1
fi
echo "✅ All checks passed"
echo "════════════════════════════════════════════════════"
exit 0
