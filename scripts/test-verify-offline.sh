#!/usr/bin/env bash
# Runs verify.cjs against committed fixtures — proves it executes, not
# just parses. Three cases must hold.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$HERE/fixtures/2026-11-10"
VERIFIER="$HERE/verify.cjs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "── positive: fixtures verify offline ──"
node "$VERIFIER" \
  "$FIX/current.json" "$FIX/snapshot.json" "$FIX/pub.pem" \
  --expected-pubkey-id volatiai-b4175311 \
  --anchor "$FIX/_anchors.jsonl"

echo
echo "── negative: tampered snapshot rejected ──"
cp "$FIX/snapshot.json" "$TMP/tampered.json"
python3 -c "
import sys
d = open('$TMP/tampered.json','rb').read()
open('$TMP/tampered.json','wb').write(d[:500] + bytes([d[500]^0x01]) + d[501:])
"
if node "$VERIFIER" "$FIX/current.json" "$TMP/tampered.json" "$FIX/pub.pem" 2>/dev/null; then
  echo "❌ tampered snapshot VERIFIED — verifier is broken"; exit 1
fi
echo "✅ tampered snapshot rejected"

echo
echo "── negative: mutated envelope snapshot_hash rejected ──"
python3 -c "
import json
e = json.load(open('$FIX/current.json'))
e['snapshot_hash'] = '0'*64
json.dump(e, open('$TMP/bad_env.json','w'))
"
if node "$VERIFIER" "$TMP/bad_env.json" "$FIX/snapshot.json" "$FIX/pub.pem" 2>/dev/null; then
  echo "❌ mutated envelope VERIFIED — verifier is broken"; exit 1
fi
echo "✅ mutated envelope rejected"

echo
echo "── negative: mutated snapshot.hash rejected ──"
python3 -c "
import json
s = json.load(open('$FIX/snapshot.json'))
s['hash'] = '0'*64
json.dump(s, open('$TMP/bad_snap.json','w'))
"
if node "$VERIFIER" "$FIX/current.json" "$TMP/bad_snap.json" "$FIX/pub.pem" 2>/dev/null; then
  echo "❌ mutated snapshot.hash VERIFIED — verifier is broken"; exit 1
fi
echo "✅ mutated snapshot.hash rejected"


echo
echo "── negative: tampered payload (valid JSON, mutated value) ──"
# Distinct from the byte-flip case: this keeps JSON syntactically valid,
# so 2b (canonical payload hash) is the layer that must catch it — not
# JSON.parse. Fails on 2b, not on the parse step.
python3 -c "
import json
s = json.load(open('$FIX/snapshot.json'))
s['total'] = s['total'] + 1
json.dump(s, open('$TMP/tampered_payload.json','w'), indent=2)
"
if node "$VERIFIER" "$FIX/current.json" "$TMP/tampered_payload.json" "$FIX/pub.pem" \
     --anchor "$FIX/_anchors.jsonl" 2>/dev/null; then
  echo "❌ tampered payload VERIFIED — verifier is broken"; exit 1
fi
echo "✅ tampered payload rejected"
echo
echo "✅ all offline verifier cases pass"
