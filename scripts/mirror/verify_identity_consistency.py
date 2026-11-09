#!/usr/bin/env python3
"""Cross-check that did.json / volatiai-key*.json / pubkey*.pem all agree.

Catches the class of bug where did.json advertises a fingerprint that
sign_snapshot.py will never produce.

Exit code 0 = consistent, 1 = drift detected.
"""
import json, base64, hashlib, sys
from pathlib import Path

ROOT     = Path(__file__).resolve().parents[2]
WELL     = ROOT / "docs" / ".well-known"
SNAP_DIR = ROOT / "docs" / "snapshots"

def spki_hash8(pem_path):
    pem = Path(pem_path).read_bytes()
    b64 = b"".join(l for l in pem.splitlines() if not l.startswith(b"-----"))
    der = base64.b64decode(b64)
    return hashlib.sha256(der).hexdigest()[:8]

def raw32(pem_path):
    pem = Path(pem_path).read_bytes()
    b64 = b"".join(l for l in pem.splitlines() if not l.startswith(b"-----"))
    return base64.b64decode(b64)[12:44]

def main():
    errs = []

    cur_fp = spki_hash8(ROOT / "docs" / "pubkey.pem")
    v0_fp  = spki_hash8(ROOT / "docs" / "pubkey-v0.pem")
    cur_hex = raw32(ROOT / "docs" / "pubkey.pem").hex()
    v0_hex  = raw32(ROOT / "docs" / "pubkey-v0.pem").hex()
    print(f"pubkey.pem     SPKI fp: volatiai-{cur_fp}  raw: {cur_hex[:16]}…")
    print(f"pubkey-v0.pem  SPKI fp: volatiai-{v0_fp}  raw: {v0_hex[:16]}…")

    # ── volatiai-key.json ──
    key = json.loads((WELL / "volatiai-key.json").read_text())
    if key.get("key_id") != f"volatiai-{cur_fp}":
        errs.append(f"volatiai-key.json key_id {key.get('key_id')!r} != volatiai-{cur_fp}")
    if key.get("publicKeyHex") != cur_hex:
        errs.append(f"volatiai-key.json publicKeyHex != pubkey.pem raw32")

    # ── volatiai-key-v0.json ──
    key0 = json.loads((WELL / "volatiai-key-v0.json").read_text())
    if key0.get("key_id") != f"volatiai-{v0_fp}":
        errs.append(f"volatiai-key-v0.json key_id {key0.get('key_id')!r} != volatiai-{v0_fp}")
    if key0.get("publicKeyHex") != v0_hex:
        errs.append(f"volatiai-key-v0.json publicKeyHex != pubkey-v0.pem raw32")

    # ── did.json ──
    did = json.loads((WELL / "did.json").read_text())
    vm_ids = {v["id"].split("#")[-1] for v in did["verificationMethod"]}
    if f"volatiai-{cur_fp}" not in vm_ids:
        errs.append(f"did.json missing verificationMethod for volatiai-{cur_fp}")
    if f"volatiai-{v0_fp}" not in vm_ids:
        errs.append(f"did.json missing verificationMethod for volatiai-{v0_fp}")

    # ── signed snapshots: pubkey_id must map to a did.json key or be legacy 'volatiai-v1' ──
    known_labels = vm_ids | {"volatiai-v1"}  # v1 = legacy hardcoded label
    for snap_path in sorted(SNAP_DIR.glob("*.json")):
        if snap_path.name.startswith("_"): continue
        try:
            snap = json.loads(snap_path.read_text())
        except Exception:
            continue
        if not snap.get("signature"): continue
        pk = snap.get("pubkey_id")
        if pk not in known_labels:
            errs.append(f"{snap_path.name}: pubkey_id {pk!r} not in did.json verificationMethods ({sorted(vm_ids)})")

    if errs:
        print("\n❌ INCONSISTENCIES:")
        for e in errs: print(f"  - {e}")
        sys.exit(1)

    print("\n✅ identity consistent across did.json, volatiai-key*.json, pubkey*.pem, and all signed snapshots")
    return 0

if __name__ == "__main__":
    sys.exit(main())
