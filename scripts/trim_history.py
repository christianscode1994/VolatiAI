#!/usr/bin/env python3
"""Delete history snapshots older than N days. Keep recent ones in git."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

KEEP_DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 90
CUTOFF = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
ROOT = Path(__file__).resolve().parent.parent / "history"

deleted = 0
for f in sorted(ROOT.rglob("*.json.gz")):
    try:
        # Files look like 2026-10-17T09-16.json.gz
        ts_str = f.stem.replace(".json", "")  # "2026-10-17T09-16"
        ts = datetime.strptime(ts_str, "%Y-%m-%dT%H-%M").replace(tzinfo=timezone.utc)
    except ValueError:
        continue
    if ts < CUTOFF:
        f.unlink()
        deleted += 1
print(f"deleted {deleted} file(s) older than {KEEP_DAYS} days")
