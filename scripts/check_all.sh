#!/bin/bash
# check_all.sh — one command to verify the entire system state.
#
# Runs, in order:
#   1. verify-cron.sh        → cron state + stale-state analysis
#   2. scripts/test_all.sh   → all 88 tests
#   3. smoke_prod.sh         → production health (health, correlation, cron freshness)
#   4. verify_signature.py   → signing module (self-test)
#   5. verify_signature.py   → canonical JS↔Python compatibility
#
# Exit 0 only if every check passes.
#
# Usage:
#   ./scripts/check_all.sh              # full check
#   ./scripts/check_all.sh --skip-prod  # skip smoke_prod (e.g. during deployment)

set -uo pipefail
cd "$(dirname "$0")/.."

SKIP_PROD=0
if [ "${1:-}" = "--skip-prod" ]; then
  SKIP_PROD=1
fi

pass=0
fail=0
failed_sections=()

section() {
  local name="$1"
  shift
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  $name"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  if "$@"; then
    pass=$((pass + 1))
    return 0
  else
    fail=$((fail + 1))
    failed_sections+=("$name")
    return 1
  fi
}

section "1/5 verify-cron.sh" ./verify-cron.sh || true
section "2/5 scripts/test_all.sh" ./scripts/test_all.sh || true

if [ "$SKIP_PROD" = "0" ]; then
  section "3/5 smoke_prod.sh" ./scripts/smoke_prod.sh || true
else
  echo ""
  echo "  (skipping smoke_prod.sh — --skip-prod)"
fi

section "4/5 verify_signature self-test" python3 scripts/verify_signature.py --self-test || true
section "5/5 verify_signature canonical-test" python3 scripts/verify_signature.py --canonical-test || true

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Summary"
echo "═══════════════════════════════════════════════════════════"
echo ""
# ─── CI status on HEAD ─────────────────────────────────────────
SHA=$(git rev-parse HEAD)
CI_RESULT=$(gh run list --workflow=test.yml --limit 20 \
  --json conclusion,headSha \
  | python3 -c "
import json, sys
for r in json.load(sys.stdin):
    if r['headSha'] == '$SHA' and r['conclusion']:
        print(r['conclusion']); break
else:
    print('no-run')
")

echo ""
echo "── CI on $SHA ──"
echo "  $CI_RESULT"
if [ "$CI_RESULT" != "success" ]; then
  echo "  ✗ CI not green on HEAD"
  fail=$((fail + 1))
else
  echo "  ✓ CI green on HEAD"
  pass=$((pass + 1))
fi

echo "Sections passed: $pass"
echo "Sections failed: $fail"

if [ $fail -gt 0 ]; then
  echo ""
  echo "Failed sections:"
  for s in "${failed_sections[@]}"; do
    echo "  ✗ $s"
  done
  echo ""
  echo "❌ $fail section(s) failed"
  exit 1
fi

echo ""
echo "✅ All $pass sections pass"
echo ""
echo "System is fully verified."

exit 0
