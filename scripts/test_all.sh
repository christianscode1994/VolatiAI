#!/bin/bash
# test_all.sh — run all test files, report per-file pass/fail
set -u
cd "$(dirname "$0")/.."

pass=0
fail=0
failed_files=()

echo "=== Python tests ==="
for f in tests/test_*.py; do
  [ -f "$f" ] || continue
  echo ""
  echo "→ $f"
  if output=$(python3 "$f" 2>&1); then
    echo "$output" | tail -3
    pass=$((pass + 1))
  else
    echo "$output" | tail -10
    fail=$((fail + 1))
    failed_files+=("$f")
  fi
done

echo ""
echo "=== Node tests ==="
for f in tests/*.mjs; do
  [ -f "$f" ] || continue
  echo ""
  echo "→ $f"
  if output=$(node "$f" 2>&1); then
    echo "$output" | tail -2
    pass=$((pass + 1))
  else
    echo "$output" | tail -10
    fail=$((fail + 1))
    failed_files+=("$f")
  fi
done

echo ""
echo "=== Script self-tests ==="

run_self() {
  local label="$1"; shift
  echo ""
  echo "→ $label"
  if output=$("$@" 2>&1); then
    echo "$output" | tail -3
    pass=$((pass + 1))
  else
    echo "$output" | tail -10
    fail=$((fail + 1))
    failed_files+=("$label")
  fi
}

run_self "verify_signature --self-test" \
  python3 scripts/verify_signature.py --self-test
run_self "verify_signature --canonical-test" \
  python3 scripts/verify_signature.py --canonical-test
run_self "resolve_entities (fixture)" \
  python3 scripts/resolve_entities.py --file tests/fixtures/entity_qids_test.json --target 1.0
run_self "classify_sector --self-test" \
  python3 scripts/classify_sector.py --self-test

echo ""
echo "=== Summary ==="
echo "Files passed: $pass"
echo "Files failed: $fail"

if [ $fail -gt 0 ]; then
  echo ""
  echo "Failed files:"
  for f in "${failed_files[@]}"; do
    echo "  ✗ $f"
  done
  echo ""
  echo "❌ $fail file(s) failed"
  exit 1
else
  echo ""
  echo "✅ All $pass test files pass"
  exit 0
fi
