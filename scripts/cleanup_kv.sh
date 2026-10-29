#!/usr/bin/env bash
# Remove KV keys for sectors that are no longer in active_sectors.json.
# Usage:
#   ./scripts/cleanup_kv.sh            # list orphans, no deletion (default)
#   ./scripts/cleanup_kv.sh --apply    # list + delete
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NS="5a2afb46033e49dc8d2ddefac347ddb5"
MODE="${1:-}"

existing=$(cd "$ROOT" && npx wrangler kv key list --namespace-id "$NS" --remote 2>/dev/null | jq -r '.[].name' | sort)
if [ -z "$existing" ]; then
  echo "✗ no keys returned — check wrangler auth / namespace ID" >&2
  exit 2
fi

active=$(python3 -c "import json,sys;print('\n'.join(json.load(open(sys.argv[1]))))" "$ROOT/config/active_sectors.json" | sort)
orphans=$(comm -23 <(echo "$existing" | grep -v "^_" ) <(echo "$active"))

if [ -z "$orphans" ]; then
  echo "✓ no orphaned KV keys"
  exit 0
fi

count=$(echo "$orphans" | wc -l | tr -d ' ')
echo "orphaned KV keys ($count):"
echo "$orphans"
echo ""

if [ "$MODE" != "--apply" ]; then
  echo "dry run — pass --apply to delete"
  exit 0
fi

while IFS= read -r key; do
  [ -z "$key" ] && continue
  echo "deleting: $key"
  (cd "$ROOT" && npx wrangler kv key delete --namespace-id "$NS" --remote "$key" 2>&1 | tail -1)
done <<< "$orphans"

echo "✓ done"
