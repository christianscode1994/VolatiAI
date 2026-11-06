#!/bin/bash
# seed_history.sh — one-time mass warm of all 325 configured sectors
# Run once to seed history; then update priority_warm.sh with winners
set -u

BASE="https://sector-slow.fourieranalys.workers.dev"
SECTORS=$(jq -r '.[]' config/active_sectors.json)

ok=0
fail=0
failed_sectors=()

for s in $SECTORS; do
  if curl -sf --max-time 15 "$BASE/$s/signal" > /dev/null 2>&1; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
    failed_sectors+=("$s")
  fi
  sleep 0.2
done

echo "seed_history: $ok ok, $fail failed"
if [ $fail -gt 0 ]; then
  echo "FAILED SECTORS:"
  printf '  %s\n' "${failed_sectors[@]}"
fi

# Save winners to file for later
printf '%s\n' $SECTORS | grep -vFxf <(printf '%s\n' "${failed_sectors[@]}") > /tmp/working_sectors.txt 2>/dev/null || true
echo "Working sectors saved to /tmp/working_sectors.txt ($(wc -l < /tmp/working_sectors.txt) sectors)"
