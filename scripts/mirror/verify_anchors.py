#!/usr/bin/env python3
"""Detect file rewrites: does every anchor still match the file on disk?"""
import hashlib, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
SNAP_DIR = ROOT / "docs" / "snapshots"
A = SNAP_DIR / "_anchors.jsonl"
if not A.exists(): print("no anchors yet"); sys.exit(0)
ok=tampered=missing=0
for line in A.read_text().splitlines():
    if not line.strip(): continue
    a = json.loads(line)
    p = SNAP_DIR / f"{a['date']}.json"
    if not p.exists(): print(f"❌ {a['date']}: file missing"); missing+=1; continue
    actual = hashlib.sha256(p.read_bytes()).hexdigest()
    if actual != a["file_sha256"]:
        print(f"❌ {a['date']}: TAMPERED expected={a['file_sha256'][:16]}… actual={actual[:16]}…"); tampered+=1
    else: ok+=1
print(f"\n✅ {ok} intact, ❌ {tampered} tampered, ⚠️  {missing} missing")
sys.exit(1 if tampered or missing else 0)
