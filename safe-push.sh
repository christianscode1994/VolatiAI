#!/bin/bash
# safe-push.sh — pull-rebase-push with retries, handles N workflow pushers
set -uo pipefail

BRANCH="${1:-main}"
MAX_RETRIES=5

for i in $(seq 1 $MAX_RETRIES); do
    echo "→ attempt $i/$MAX_RETRIES"

    # Pull latest with rebase
    if ! git pull --rebase origin "$BRANCH"; then
        echo "✗ pull --rebase failed — resolve conflicts manually"
        git rebase --abort 2>/dev/null || true
        exit 1
    fi

    # Try push
    if git push origin "$BRANCH"; then
        echo "✓ pushed on attempt $i"
        exit 0
    fi

    echo "  push rejected — another writer landed a commit, retrying..."
    sleep 3
done

echo "✗ failed after $MAX_RETRIES attempts — manual intervention needed"
echo "  run: git log origin/$BRANCH --oneline -5"
exit 1
