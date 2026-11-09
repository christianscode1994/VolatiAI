#!/usr/bin/env python3
"""Anchor one snapshot: file-byte hash + optional RFC 3161 timestamp."""
import hashlib, json, sys, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAP_DIR = ROOT / "docs" / "snapshots"
ANCHOR_FILE = SNAP_DIR / "_anchors.jsonl"

def main(argv):
    if len(argv) < 2:
        print("usage: anchor_snapshot.py YYYY-MM-DD [--no-tsa]"); sys.exit(1)
    date = argv[1]; do_tsa = "--no-tsa" not in argv
    p = SNAP_DIR / f"{date}.json"
    if not p.exists(): print(f"❌ {p} not found"); sys.exit(1)
    snap = json.loads(p.read_text())
    entry = {
        "date": date,
        "file_sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        "snapshot_hash": snap.get("hash"),
        "prev_hash": snap.get("prev_hash"),
        "chain_gap": snap.get("chain_gap"),
        "signature_present": bool(snap.get("signature")),
        "anchored_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "anchor_version": 1,
    }
    if do_tsa:
        tsr = p.with_suffix(p.suffix + ".tsr")
        try:
            subprocess.run(["openssl","ts","-query","-data",str(p),"-sha256","-cert","-out","/tmp/vt.tsq"], check=True, capture_output=True)
            subprocess.run(["curl","-sS","-H","Content-Type: application/timestamp-query","--data-binary","@/tmp/vt.tsq","https://freetsa.org/tsr","-o",str(tsr)], check=True, capture_output=True)
            entry["tsa_file"] = tsr.name
            entry["tsa_source"] = "freetsa.org"
        except Exception as e:
            print(f"⚠️  TSA skipped: {e}")
    ANCHOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ANCHOR_FILE.open("a") as f: f.write(json.dumps(entry, sort_keys=True) + "\n")
    print(f"✅ anchored {date}  file={entry['file_sha256'][:16]}…  hash={entry['snapshot_hash']}")

if __name__ == "__main__": main(sys.argv)
