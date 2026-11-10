#!/usr/bin/env bash
# Runs verify.cjs against committed fixtures. Every negative case must
# fail at the SPECIFIC layer that is supposed to catch it — "exit 1 for
# any reason" is not sufficient. Each case asserts both (a) rejection and
# (b) the layer tag that rejected.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$HERE/fixtures/2026-11-10"
VERIFIER="$HERE/verify.cjs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Runs verifier with combined stdout+stderr, captures exit code without
# tripping set -e.
run_v() {
  local out rc
  out=$(node "$VERIFIER" "$@" 2>&1) && rc=0 || rc=$?
  printf '%s\n' "$out"
  return "$rc"
}

# Asserts: verifier rejected (rc != 0) AND its output contains a line with
# the layer tag $2 in a failing context (same line contains ❌).
assert_rejected_by() {
  local label="$1" layer="$2"; shift 2
  local out rc
  out=$(node "$VERIFIER" "$@" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "❌ $label: verifier ACCEPTED — expected rejection"
    printf '%s\n' "$out"; exit 1
  fi
  # Require the layer tag and the failure char on the SAME line.
  if ! printf '%s\n' "$out" | grep -F "$layer" | grep -qF "❌"; then
    echo "❌ $label: rejected, but not by $layer — wrong layer fired"
    printf '%s\n' "$out"; exit 1
  fi
  echo "✅ $label rejected by $layer"
}

echo "── positive: fixtures verify offline ──"
node "$VERIFIER" \
  "$FIX/current.json" "$FIX/snapshot.json" "$FIX/pub.pem" \
  --expected-pubkey-id volatiai-b4175311 \
  --anchor "$FIX/_anchors.jsonl"
echo

echo "── negative: tampered bytes (JSON-parse layer) ──"
# This case deliberately breaks JSON syntax. It tests JSON.parse
# rejection, NOT the 2b canonical-hash layer. The payload-mutation case
# below is what isolates 2b.
cp "$FIX/snapshot.json" "$TMP/tampered_bytes.json"
python3 -c "
d = open('$TMP/tampered_bytes.json','rb').read()
open('$TMP/tampered_bytes.json','wb').write(d[:500] + bytes([d[500]^0x01]) + d[501:])
"
out=$(node "$VERIFIER" "$FIX/current.json" "$TMP/tampered_bytes.json" "$FIX/pub.pem" 2>&1) && rc=0 || rc=$?
if [ "$rc" -eq 0 ]; then
  echo "❌ tampered bytes ACCEPTED"; printf '%s\n' "$out"; exit 1
fi
if ! printf '%s\n' "$out" | grep -qF "not valid JSON"; then
  echo "❌ tampered bytes rejected, but not by JSON.parse — wrong layer"
  printf '%s\n' "$out"; exit 1
fi
echo "✅ tampered bytes rejected (JSON-parse layer)"
echo

echo "── negative: tampered payload (2b — canonical hash layer) ──"
python3 -c "
import json
s = json.load(open('$FIX/snapshot.json'))
s['total'] = s['total'] + 1
json.dump(s, open('$TMP/tampered_payload.json','w'), indent=2)
"
assert_rejected_by "tampered payload" "[2b]" \
  "$FIX/current.json" "$TMP/tampered_payload.json" "$FIX/pub.pem" \
  --anchor "$FIX/_anchors.jsonl"
echo

echo "── negative: mutated envelope snapshot_hash (1 — signature layer) ──"
python3 -c "
import json
e = json.load(open('$FIX/current.json'))
e['snapshot_hash'] = '0'*64
json.dump(e, open('$TMP/bad_env.json','w'))
"
assert_rejected_by "mutated envelope" "[1]" \
  "$TMP/bad_env.json" "$FIX/snapshot.json" "$FIX/pub.pem"
echo

echo "── negative: mutated snapshot.hash (2a — envelope binding layer) ──"
python3 -c "
import json
s = json.load(open('$FIX/snapshot.json'))
s['hash'] = '0'*64
json.dump(s, open('$TMP/bad_snap.json','w'))
"
assert_rejected_by "mutated snapshot.hash" "[2a]" \
  "$FIX/current.json" "$TMP/bad_snap.json" "$FIX/pub.pem"
echo

echo "✅ all offline verifier cases pass"
