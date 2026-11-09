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
        if tsr.exists():
            entry["tsa_file"] = tsr.name
            entry["tsa_source"] = "freetsa.org"
            print(f"  \u00b7 TSA timestamp already exists: {tsr.name} (not overwritten)")
        else:
            try:
                subprocess.run(["openssl","ts","-query","-data",str(p),"-sha256","-cert","-out","/tmp/vt.tsq"], check=True, capture_output=True)
                subprocess.run(["curl","-sS","-H","Content-Type: application/timestamp-query","--data-binary","@/tmp/vt.tsq","https://freetsa.org/tsr","-o",str(tsr)], check=True, capture_output=True)
                entry["tsa_file"] = tsr.name
                entry["tsa_source"] = "freetsa.org"
            except Exception as e:
                print(f"\u26a0\ufe0f  TSA skipped: {e}")

    # Idempotency: no duplicate entries for (date, file_sha256)
    existing = []
    if ANCHOR_FILE.exists():
        for line in ANCHOR_FILE.read_text().splitlines():
            if line.strip():
                try: existing.append(json.loads(line))
                except json.JSONDecodeError: pass
    same_date  = [a for a in existing if a.get("date") == date]
    same_exact = [a for a in same_date if a.get("file_sha256") == entry["file_sha256"]]
    force = "--force" in argv
    if same_exact and not force:
        print(f"\u00b7 {date} already anchored with same file_sha256 ({entry['file_sha256'][:16]}\u2026)")
        print(f"  anchored_at: {same_exact[0].get('anchored_at')}")
        print("  (pass --force to append anyway)")
        return
    if same_date and not same_exact and not force:
        print(f"\u26a0\ufe0f  {date} previously anchored with DIFFERENT file_sha256:")
        for a in same_date:
            print(f"     {a['file_sha256'][:16]}\u2026  at {a.get('anchored_at')}")
        print(f"  new: {entry['file_sha256'][:16]}\u2026")
        print("  File changed since last anchor. Re-run with --force to append")
        print("  the new entry (keeps both, for audit trail).")
        sys.exit(2)

    ANCHOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ANCHOR_FILE.open("a") as f: f.write(json.dumps(entry, sort_keys=True) + "\n")
    print(f"✅ anchored {date}  file={entry['file_sha256'][:16]}…  hash={entry['snapshot_hash']}")

if __name__ == "__main__": main(sys.argv)
