#!/usr/bin/env bash
# Run classify_residue.py with before/after diff logging.
set -euo pipefail
cd "$HOME/VolatiAI"

LIVE=config/sector_categories_ollama.json
PREV=config/.classify_prev.json
CHANGELOG=config/classify_changes.log
RUNLOG=config/classify_runs.log

ts() { date +%Y-%m-%dT%H:%M:%S%z; }

cp "$LIVE" "$PREV"
echo "$(ts) | start" >> "$RUNLOG"

if ! python3 classify_residue.py; then
    echo "$(ts) | FAIL" >> "$RUNLOG"
    exit 1
fi

echo "$(ts) | done" >> "$RUNLOG"

DIFF=$(python3 sector_tools.py diff "$PREV" "$LIVE")
if [ "$DIFF" != "(no changes)" ]; then
    echo "$(ts) | changes:" | tee -a "$CHANGELOG"
    echo "$DIFF" | tee -a "$CHANGELOG"
else
    echo "no changes"
fi
