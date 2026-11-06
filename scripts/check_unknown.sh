#!/usr/bin/env bash
# Fail if any sector is stuck in 'other'/'error'/'unclassified'.
set -e
FILE="config/sector_categories_ollama.json"
[ -f "$FILE" ] || exit 0
N=$(python3 -c "
import json
d = json.load(open('$FILE'))
print(sum(1 for v in d.values() if v in ('other','error','unclassified')))
")
if [ "$N" != "0" ]; then
    echo "✗ $N sector(s) stuck in other/error/unclassified in $FILE"
    echo "  Fix: python3 classify_residue.py"
    exit 1
fi
echo "✓ 0 unclassified sectors"
