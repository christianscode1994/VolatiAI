#!/bin/bash

# Refuse no-op commits (would have caught the final_all.txt failure)
if git diff --cached --quiet; then
  echo "✗ pre-commit: nothing staged — refusing no-op commit" >&2
  exit 1
fi

# Pre-commit hook — runs all tests before allowing commit.
#
# Install: cp scripts/pre_commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Bypass (when you're sure): git commit --no-verify
#
# This exists because of the pattern observed 2026-11-04/05: 8 commits
# claimed "tests pass" when they didn't. Every one would have been caught
# by running the tests immediately before the commit. This hook forces that.

LOG=/tmp/pre_commit_test.log

echo "→ Running tests before commit..."
if ./scripts/test_all.sh > "$LOG" 2>&1; then
    echo "✓ All tests pass"
    exit 0
fi

echo ""
echo "✗ Tests failed — commit blocked."
echo ""
echo "Last 20 lines of output:"
echo "───────────────────────────────────────"
tail -20 "$LOG"
echo "───────────────────────────────────────"
echo ""
echo "Bypass (only if you're certain): git commit --no-verify"
exit 1
