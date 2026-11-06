#!/bin/bash
# Safe commit: fail loudly when git add fails or nothing is staged.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <message-file> <file1> [file2 ...]" >&2
  exit 2
fi

MSG="$1"; shift
FILES=("$@")

if [ ! -s "$MSG" ]; then
  echo "✗ Message file '$MSG' missing or empty" >&2; exit 3
fi

for f in "${FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "✗ File does not exist: $f" >&2
    echo "  (this is the 'git add: pathspec not matched' bug)" >&2
    exit 4
  fi
done

BEFORE=$(git rev-parse HEAD)
git add -- "${FILES[@]}"


# refuse-placeholder-msg: catch unfilled values in the commit message
if grep -qE '<PASTE|<ACTUAL|\bN (lines|files|tests)\b|N \(~|\bTODO\b|\bFIXME\b' "$MSG"; then
  echo "✗ Message contains an unfilled placeholder:" >&2
  grep -nE '<PASTE|<ACTUAL|\bN (lines|files|tests)\b|N \(~|\bTODO\b|\bFIXME\b' "$MSG" >&2
  echo "  Fill in the actual values, then retry." >&2
  exit 7
fi

if git diff --cached --quiet; then
  echo "✗ Nothing staged — refusing to commit (would be a no-op)" >&2
  exit 5
fi

echo "=== Files to be committed ==="
git diff --cached --stat
echo

git commit -F "$MSG"

AFTER=$(git rev-parse HEAD)
if [ "$BEFORE" = "$AFTER" ]; then
  echo "✗ Commit did not land (HEAD unchanged)" >&2
  exit 6
fi

echo "=== Committed ==="
git log --oneline -1
