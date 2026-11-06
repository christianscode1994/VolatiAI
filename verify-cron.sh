#!/bin/bash
# verify-cron.sh — tomorrow morning's milestone check
#
# Run this at ~04:30 UTC on Nov 5 2026, ~1 hour after the first cron fire.
# The single number that matters: shards.seen should be 5.

set -uo pipefail

WORKER="https://sector-slow.fourieranalys.workers.dev"

echo "=== VolatiAI — cron verification $(date -u) ==="
echo ""

# ── 1. The milestone: shards fired ─────────────────────────────
echo "── 1. Cron shards ──"
echo "Expect: seen: 5, expected: 5"
echo "If seen: 0, the cron trigger didn't register — debug worker logs"
echo ""
CRON_JSON=$(curl -s "$WORKER/health?full=1" | jq -c '.checks.cron')
echo "$CRON_JSON" | jq '{shards: .shards_today, last_cron: .last_run, cron: .cron, failed: .failed, total: .total}'
echo ""

# ── Stale-state detection ───────────────────────────────────────
# If last_cron is NOT today's date in UTC, the cron hasn't fired today.
# If the cron field shows "02 4 * * *", that's the old 10-shard worker —
# the current 5-shard array is: 17 3, 27 3, 37 3, 47 3, 57 3
TODAY=$(date -u +%Y-%m-%d)
LAST_CRON=$(echo "$CRON_JSON" | jq -r '.last_run // "none"' | cut -dT -f1)
CRON_SCHED=$(echo "$CRON_JSON" | jq -r '.cron // "none"')

echo "── Stale-state analysis ──"
echo "Today UTC: $TODAY"
echo "Last cron date: $LAST_CRON"
echo "Last cron schedule: $CRON_SCHED"
echo ""

if [ "$LAST_CRON" != "$TODAY" ]; then
  echo "⚠ last_cron is NOT today. Cron has not fired since Nov 4."
  echo "  shards.seen (5) is likely from the OLD 10-shard worker run."
  echo "  Tomorrow morning's scheduled fire (03:17 UTC) is the real test."
  echo ""
fi

if [ "$CRON_SCHED" = "02 4 * * *" ]; then
  echo "⚠ cron field shows '02 4 * * *' — this is from the OLD 10-shard"
  echo "  worker. Your current worker has 5 shards:"
  echo "    17 3, 27 3, 37 3, 47 3, 57 3"
  echo "  If tomorrow shows a different cron (any of the 5 above), the new"
  echo "  worker fired. If it still shows '02 4', the new worker has never"
  echo "  fired — debug the trigger registration."
  echo ""
fi

if [ "$LAST_CRON" = "$TODAY" ] && [ "$CRON_SCHED" != "02 4 * * *" ]; then
  echo "✓ Fresh cron fire detected. last_run is today, cron is a current shard."
  echo "  The 5-shard worker is working. Investigate any 'failed' count"
  echo "  shown above — that's now a real current failure rate."
  echo ""
fi

# ── Shard-level detail ──
# Fetch the actual shards that fired today so we can see WHICH ones are missing.
SHARD_DATA=$(curl -s "$WORKER/health?full=1" | jq -c '.checks.cron.shards_today // {}')
SEEN=$(echo "$SHARD_DATA" | jq -r '.seen // 0')
EXPECTED=$(echo "$SHARD_DATA" | jq -r '.expected // 5')

if [ "$SEEN" -lt "$EXPECTED" ]; then
  echo "── Shard detail (${SEEN}/${EXPECTED} fired) ──"
  echo "Missing shard indices indicate which cron didn't complete."
  echo ""

  # Fetch actual shard list from KV via health?full=1 augmentation (if available)
  # Otherwise, infer from _cron_shards_<date> via an alternate endpoint
  SHARD_DETAIL=$(curl -s "$WORKER/health?full=1" | jq -c '.checks.cron.shard_indices // []' 2>/dev/null)

  if [ "$SHARD_DETAIL" != "[]" ] && [ -n "$SHARD_DETAIL" ]; then
    FIRED=$(echo "$SHARD_DETAIL" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')
    echo "  Fired indices: [$FIRED]"
    MISSING=""
    for i in 0 1 2 3 4; do
      if ! echo "$SHARD_DETAIL" | jq -e ". | index($i)" > /dev/null 2>&1; then
        MISSING="${MISSING}$i "
      fi
    done
    if [ -n "$MISSING" ]; then
      echo "  Missing indices: [$MISSING]"
      echo ""
      echo "  Missing shard 0 usually means the CPU-budget issue."
      echo "  Missing shard 4 usually means timeout on the last collection."
      echo "  Any other missing shard needs investigation via Cloudflare logs."
    fi
  else
    echo "  (worker /health does not expose shard_indices array)"
    echo "  Check KV directly:"
    echo "    npx wrangler kv key get \"_cron_shards_${TODAY}\" \\"
    echo "      --namespace-id 5a2afb46033e49dc8d2ddefac347ddb5 --remote"
  fi
  echo ""
fi


# ── 2. Fresh data written by cron (not manual) ────────────────
echo "── 2. Fresh correlation snapshot ──"
echo "Expect: _corr_YYYY-MM-DD for today (Nov 5), written by cron not ?snapshot=1"
echo "Look for window_days: 1 (only today's snapshot exists)"
echo ""
curl -s "$WORKER/_correlation?days=1" \
  | jq '{window_days, dates, pair_count: (.pairs | length)}'
echo ""

# ── 3. Stability data ready to become meaningful ──────────────
echo "── 3. Stability (still trivially 100% today) ──"
echo "Expect: days_present: 1 for all pairs, stability_pct: 100 (trivial)"
echo "After 3+ days: stability_pct < 100 means intermittent"
echo ""
curl -s "$WORKER/_correlation?days=7" \
  | jq '.pairs[] | {a, b, days_present, stability_pct}'
echo ""

# ── 4. Provenance state ───────────────────────────────────────
echo "── 4. Provenance (should still be 2 pairs) ──"
echo "Expect: treasuries/t-gov and cisa-kev/cisa-kev-total"
echo ""
curl -s "$WORKER/_correlation" \
  | jq '{pairs_count, pairs: [.pairs[] | {a, b, verdict}]}'
echo ""

# ── 5. Sanity: worker version still caf319ed ──────────────────
echo "── 5. Worker version (should be caf319ed unless changed) ──"
echo "If different: someone deployed. Verify that was intentional."
echo ""
echo "  Check Cloudflare dashboard → Workers → sector-slow → Version ID"
echo ""

echo "=== End. The one number to remember: shards.seen ==="
