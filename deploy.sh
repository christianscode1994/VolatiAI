#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
FILE="workers/sector-slow/src/index.js"

echo "→ Syntax check"
node --check "$FILE"

echo "→ Function presence"
test $(grep -c 'function bhAdjust\|function checkContradiction\|function computeVerdict\|function computeReliability' "$FILE") -eq 4 \
  || { echo "FAIL: missing functions"; exit 1; }

echo "→ Deploy"
cd workers/sector-slow
npx wrangler deploy

echo "→ Verify production"
sleep 3
curl -sf "https://sector-slow.fourieranalys.workers.dev/_correlation" | jq -e '.pairs_count > 0' > /dev/null \
  || { echo "FAIL: production pairs_count == 0"; exit 1; }
curl -sf "https://sector-slow.fourieranalys.workers.dev/_correlation" | jq -e '.pairs[0] | has("verdict")' > /dev/null \
  || { echo "FAIL: verdict field missing on production"; exit 1; }

echo "✓ Deploy successful"
