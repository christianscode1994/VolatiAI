#!/usr/bin/env python3
"""Verify FreeTSA RFC 3161 timestamps against their snapshot files.

Usage:
  python3 scripts/mirror/verify_tsr.py 2026-11-09
  python3 scripts/mirror/verify_tsr.py --all

Caches FreeTSA's CA cert at ~/.cache/volatiai/freetsa-cacert.pem on first run.
Requires `openssl` (macOS: system-installed; Linux: standard).
"""
import subprocess, sys, urllib.request
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[2]
SNAP_DIR   = ROOT / "docs" / "snapshots"
CACERT     = Path.home() / ".cache" / "volatiai" / "freetsa-cacert.pem"
CACERT_URL = "https://www.freetsa.org/files/cacert.pem"
TSACERT_URL = "https://www.freetsa.org/files/tsa.crt"
TSACERT    = Path.home() / ".cache" / "volatiai" / "freetsa-tsa.crt"

def ensure_certs():
    CACERT.parent.mkdir(parents=True, exist_ok=True)
    for url, dest in [(CACERT_URL, CACERT), (TSACERT_URL, TSACERT)]:
        if dest.exists():
            continue
        try:
            urllib.request.urlretrieve(url, dest)
            print(f"✓ cached {dest.name} → {dest}")
        except Exception as e:
            print(f"❌ cannot download {url}: {type(e).__name__}: {e}")
            print(f"   manual: curl -o {dest} {url}")
            return False
    return True

def verify_one(date):
    tsr  = SNAP_DIR / f"{date}.json.tsr"
    snap = SNAP_DIR / f"{date}.json"
    if not tsr.exists():
        print(f"  {date}: ❌ no .tsr"); return False
    if not snap.exists():
        print(f"  {date}: ❌ no snapshot"); return False
    r = subprocess.run(
        ["openssl","ts","-verify","-in",str(tsr),"-data",str(snap),
         "-CAfile",str(CACERT),"-untrusted",str(TSACERT)],
        capture_output=True, text=True)
    if r.returncode == 0 and "Verification: OK" in r.stdout:
        ts = ""
        for line in r.stdout.splitlines():
            if "Time stamp:" in line:
                ts = line.split("Time stamp:", 1)[1].strip(); break
        print(f"  {date}: ✓ {ts}")
        return True
    print(f"  {date}: ❌ verify failed")
    for line in (r.stderr or r.stdout).splitlines()[:4]:
        if line.strip(): print(f"      {line}")
    return False

def main(argv):
    if len(argv) < 2:
        print(__doc__); sys.exit(1)
    if not ensure_certs():
        sys.exit(2)
    if argv[1] == "--all":
        dates = sorted(p.name.replace(".json.tsr","") for p in SNAP_DIR.glob("*.json.tsr"))
    else:
        dates = [argv[1]]
    print(f"Verifying {len(dates)} timestamp(s)…")
    ok = fail = 0
    for d in dates:
        (ok := ok + 1) if verify_one(d) else (fail := fail + 1)
    print(f"\n✅ {ok} verified, ❌ {fail} failed")
    sys.exit(0 if fail == 0 else 1)

if __name__ == "__main__": main(sys.argv)
