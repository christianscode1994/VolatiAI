#!/usr/bin/env bash
# VolatiAI sector sweep — double-hit verification.
# Usage:
#   ./scripts/sweep.sh                 # all workers
#   ./scripts/sweep.sh dense           # one worker
#   WAIT_BEFORE=8 WAIT_BETWEEN=3 ./scripts/sweep.sh sparse
# Exit: 0 = clean, 1 = confirmed fails, 2 = usage/error.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE="$ROOT/config/active_sectors.json"
WAIT_BEFORE="${WAIT_BEFORE:-5}"
WAIT_BETWEEN="${WAIT_BETWEEN:-2}"
TARGET="${1:-all}"

[ -f "$ACTIVE" ] || { echo "✗ $ACTIVE missing" >&2; exit 2; }
sectors=$(python3 -c "import json,sys;print(' '.join(json.load(open(sys.argv[1]))))" "$ACTIVE")

TOTAL_FAILS=0
TOTAL_TRANSIENT=0

check_worker() {
  local w="$1"
  local base="https://sector-${w}.fourieranalys.workers.dev"
  echo "── $w ──"
  for s in $sectors; do
    local h1
    h1=$(curl -s --max-time 10 "$base/$s" 2>/dev/null | jq -r '.sources.healthy // "skip"' 2>/dev/null || echo skip)
    [ "$h1" = "0" ] || continue
    sleep "$WAIT_BEFORE"
    curl -s --max-time 10 "$base/$s?bust=$(date +%s)" >/dev/null 2>&1 || true
    sleep "$WAIT_BETWEEN"
    local h2
    h2=$(curl -s --max-time 10 "$base/$s" 2>/dev/null | jq -r '.sources.healthy // "skip"' 2>/dev/null || echo skip)
    if [ "$h2" = "0" ]; then
      echo "  CONFIRMED FAIL: $s"
      TOTAL_FAILS=$((TOTAL_FAILS+1))
    else
      echo "  transient (recovered): $s"
      TOTAL_TRANSIENT=$((TOTAL_TRANSIENT+1))
    fi
  done
}

case "$TARGET" in
  sparse|dense|slow) check_worker "$TARGET" ;;
  all) for w in sparse dense slow; do check_worker "$w"; done ;;
  *) echo "Usage: $0 [sparse|dense|slow|all]" >&2; exit 2 ;;
esac

echo ""
echo "confirmed fails: $TOTAL_FAILS   transient: $TOTAL_TRANSIENT"
[ "$TOTAL_FAILS" -eq 0 ] && { echo "✓ all workers clean"; exit 0; } || exit 1
