#!/bin/bash
# Production smoke test — verifies the deployed worker is in expected state.
#
# Checks:
#   1. /health responds 200 with {ok: true}
#   2. /_correlation responds with expected shape (pairs_count > 0)
#   3. /_correlation?days=1 returns at least one date
#   4. cron.last_run is within 30 hours
#   5. Provenance pairs all have verdict confirm:provenance
#
# Usage: ./scripts/smoke_prod.sh
# Exit: 0 = all pass, 1 = any check failed

set -uo pipefail
BASE="${VOLATIAI_BASE:-https://sector-slow.fourieranalys.workers.dev}"

pass=0
fail=0
failures=()

check() {
    local name="$1"
    local result="$2"
    local detail="$3"
    if [ "$result" = "1" ]; then
        echo "  ✓ $name"
        pass=$((pass + 1))
    else
        echo "  ✗ $name — $detail"
        failures+=("$name: $detail")
        fail=$((fail + 1))
    fi
}

echo "=== Production smoke test ==="
echo "  base: $BASE"
echo ""

# ── 1. Health responds ──
health=$(curl -sf "$BASE/health" 2>/dev/null || echo "")
if [ -z "$health" ]; then
    check "health endpoint" "0" "no response"
else
    ok=$(echo "$health" | jq -r '.ok // false' 2>/dev/null)
    if [ "$ok" = "true" ]; then
        check "health endpoint" "1" ""
    else
        check "health endpoint" "0" "ok != true"
    fi
fi

# ── 2. Correlation endpoint ──
corr=$(curl -sf "$BASE/_correlation" 2>/dev/null || echo "")
if [ -z "$corr" ]; then
    check "_correlation" "0" "no response"
else
    cnt=$(echo "$corr" | jq -r '.pairs_count // 0' 2>/dev/null)
    if [ "$cnt" -gt 0 ]; then
        check "_correlation responds with pairs" "1" ""
    else
        check "_correlation responds with pairs" "0" "pairs_count = $cnt"
    fi
    # Check provenance verdicts
    bad=$(echo "$corr" | jq '[.pairs[] | select(.provenance == true and .verdict != "confirm:provenance")] | length' 2>/dev/null)
    if [ "$bad" = "0" ]; then
        check "all provenance pairs have confirm:provenance verdict" "1" ""
    else
        check "all provenance pairs have confirm:provenance verdict" "0" "$bad pairs have wrong verdict"
    fi
fi

# ── 3. ?days=1 returns a date ──
days=$(curl -sf "$BASE/_correlation?days=1" 2>/dev/null || echo "")
if [ -z "$days" ]; then
    check "_correlation?days=1" "0" "no response"
else
    dates_count=$(echo "$days" | jq -r '.dates | length // 0' 2>/dev/null)
    if [ "$dates_count" -gt 0 ]; then
        first_date=$(echo "$days" | jq -r '.dates[0] // "none"')
        check "_correlation?days=1 returns dates (latest: $first_date)" "1" ""
    else
        check "_correlation?days=1 returns dates" "0" "empty dates array"
    fi
fi

# ── 4. Cron freshness ──
full=$(curl -sf "$BASE/health?full=1" 2>/dev/null || echo "")
if [ -z "$full" ]; then
    check "health?full=1" "0" "no response"
else
    age=$(echo "$full" | jq -r '.checks.cron.age_hours // 999' 2>/dev/null)
    if [ "$(echo "$age < 30" | bc 2>/dev/null || echo 0)" = "1" ]; then
        check "cron recent (age ${age}h)" "1" ""
    else
        check "cron recent" "0" "age = ${age}h (>30)"
    fi
fi

# ── Summary ──
echo ""
echo "=== Summary ==="
echo "Pass: $pass"
echo "Fail: $fail"

if [ $fail -gt 0 ]; then
    echo ""
    echo "Failed checks:"
    for f in "${failures[@]}"; do
        echo "  ✗ $f"
    done
    exit 1
fi
echo ""
echo "✅ Production state looks healthy"
exit 0
