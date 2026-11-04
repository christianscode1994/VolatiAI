#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
FILE="workers/sector-slow/src/index.js"

echo "→ Syntax check"
node --check "$FILE"

echo "→ Function presence"
test $(grep -c 'function bhAdjust\|function checkContradiction\|function computeVerdict\|function computeReliability' "$FILE") -eq 4 \
  || { echo "FAIL: missing functions"; exit 1; }

echo "→ Upload version"
OUT=$(cd workers/sector-slow && npx wrangler versions upload 2>&1)
VERSION=$(echo "$OUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
PREVIEW=$(echo "$OUT" | grep -oE 'https://[a-f0-9]+-sector-slow[^ ]+' | head -1)

test -n "$VERSION" || { echo "FAIL: no version ID captured"; exit 1; }
test -n "$PREVIEW" || { echo "FAIL: no preview URL captured"; exit 1; }

echo "→ Preview smoke test: $PREVIEW"
sleep 3
curl -sf "$PREVIEW/_correlation" | jq -e '.pairs_count > 0' > /dev/null \
  || { echo "FAIL: pairs_count == 0 on preview"; exit 1; }
curl -sf "$PREVIEW/_correlation" | jq -e '.pairs[0] | has("verdict")' > /dev/null \
  || { echo "FAIL: verdict field missing on preview"; exit 1; }

echo "→ Promote to production"
cd workers/sector-slow
npx wrangler versions deploy "$VERSION" --yes

echo "→ Verify production"
sleep 3
curl -sf "https://sector-slow.fourieranalys.workers.dev/_correlation" | jq -e '.pairs_count > 0' > /dev/null \
  || { echo "FAIL: production pairs_count == 0"; exit 1; }

echo "✓ Deploy successful (version $VERSION)"
