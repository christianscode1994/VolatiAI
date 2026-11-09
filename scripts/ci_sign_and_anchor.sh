#!/usr/bin/env bash
# Atomic sign + anchor for the daily snapshot cron.
#   scripts/ci_sign_and_anchor.sh           # uses today (UTC)
#   scripts/ci_sign_and_anchor.sh 2026-11-10
#
# Prereq: snapshot file exists at docs/snapshots/${DATE}.json.
# Requires: python3 + cryptography (for sign_snapshot.py)
#           openssl + curl (for FreeTSA .tsr)
#
# Signs, anchors (idempotent), then verifies the .tsr locally before
# declaring success. Any failure exits non-zero so CI flags it.
set -euo pipefail

DATE="${1:-$(date -u +%Y-%m-%d)}"
cd "$(dirname "$0")/.."

SNAP="docs/snapshots/${DATE}.json"
if [ ! -f "$SNAP" ]; then
  echo "❌ snapshot not found: $SNAP" >&2
  exit 1
fi

echo "→ signing ${DATE}"
python3 scripts/sign_snapshot.py "$SNAP"

echo "→ anchoring ${DATE} (idempotent)"
python3 scripts/mirror/anchor_snapshot.py "$DATE"

echo "→ verifying ${DATE} timestamp locally"
python3 scripts/mirror/verify_tsr.py "$DATE"

if command -v ots >/dev/null 2>&1; then
  echo "→ OpenTimestamps stamp of anchor log"
  ots stamp docs/snapshots/_anchors.jsonl 2>&1 || echo "⚠ OTS stamp failed (non-fatal; FreeTSA .tsr still covers this snapshot)"
fi

echo "✓ ${DATE} signed, anchored, timestamp-verified"
