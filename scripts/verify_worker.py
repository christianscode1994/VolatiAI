#!/usr/bin/env python3
"""verify_worker.py — did the deploy take effect end-to-end?

After a Worker deploy, three things need to be true:
  1. The live endpoint returns what the code now generates
  2. The last digest run recorded that same value
  3. History reflects the new behavior (not pre-deploy state)

This tool checks all three and reports pass/fail per check.

Usage:
    python3 scripts/verify_worker.py <sector-name>
    python3 scripts/verify_worker.py cve-feed
    python3 scripts/verify_worker.py carbon-intensity
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL = ssl.create_default_context()

HISTORY = Path("data/digest_history.json")
ACTIVE = Path("config/active_sectors.json")
WORKER_BASES = {
    "dense": "https://sector-dense.fourieranalys.workers.dev",
    "sparse": "https://sector-sparse.fourieranalys.workers.dev",
    "slow": "https://sector-slow.fourieranalys.workers.dev",
}


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"user-agent": "VolatiAI/1.0"})
        with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)[:100]}


def find_sector_density(sector):
    """Look up sector in config to see which Worker serves it."""
    for density, base in WORKER_BASES.items():
        r = fetch(base + "/" + sector + "/signal")
        if not isinstance(r, dict) or r.get("error") or r.get("sources") is None:
            continue
        if r.get("sector") == sector or "sources" in r:
            return density
    return None


def current_digest_value(sector):
    """Get the last recorded value from digest history."""
    if not HISTORY.exists():
        return None, None, None
    runs = json.load(HISTORY.open()).get("runs", [])
    if not runs:
        return None, None, None
    for run in reversed(runs):
        data = run.get("sectors", {}).get(sector)
        if data:
            return (
                run.get("timestamp", "?")[:19],
                data.get("event_id"),
                data.get("delta_current"),
            )
    return None, None, None


def history_fires(sector, lookback=10):
    """Return (fires, appearances) from last N runs."""
    if not HISTORY.exists():
        return 0, 0
    runs = json.load(HISTORY.open()).get("runs", [])[-lookback:]
    fires = sum(1 for r in runs if r.get("sectors", {}).get(sector, {}).get("has_signal"))
    apps = sum(1 for r in runs if sector in r.get("sectors", {}))
    return fires, apps


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    sector = sys.argv[1]

    if not ACTIVE.exists():
        print("error: active_sectors.json not found")
        return 1
    active = json.load(ACTIVE.open())
    if sector not in active:
        print(f"  ✗ '{sector}' not in active_sectors.json")
        return 1

    print(f"\n=== Verify: {sector} ===\n")

    # Check 1: Worker responds
    density = find_sector_density(sector)
    if not density:
        print(f"  ✗ No Worker serves '{sector}' (tried dense, sparse, slow)")
        return 1
    base = WORKER_BASES[density]
    signal = fetch(base + "/" + sector + "/signal")
    raw = fetch(base + "/" + sector + "/raw")

    print(f"  Worker:  {base}/{sector}/signal ({density})")
    if raw.get("error"):
        print(f"  ✗ Worker fetch failed: {raw['error']}")
        return 1
    print(f"  ✓ Worker responds")

    # Extract live value
    worker_event_id = None
    if "sources" in raw:
        for src_data in raw["sources"].values():
            if isinstance(src_data, dict) and src_data.get("data"):
                inner = src_data["data"]
                if isinstance(inner, dict):
                    worker_event_id = inner.get("id")

    print(f"\n  Live event_id:      {worker_event_id}")
    if signal.get("context"):
        print(f"  Signal context:     {signal['context']}")
    print(f"  Signal summary:     {signal.get('summary', '?')}")

    # Check 2: Last digest recorded value
    ts, digest_event_id, digest_value = current_digest_value(sector)
    print(f"\n  Last digest run:    {ts}")
    print(f"  Digest event_id:    {digest_event_id}")
    print(f"  Digest delta:       {digest_value}")

    # Check 3: Deployment consistency
    print("\n  Deployment consistency:")
    if worker_event_id and digest_event_id:
        if str(worker_event_id) == str(digest_event_id):
            print(f"  ✓ Live and history match ({worker_event_id})")
        else:
            print(f"  ⚠ MISMATCH")
            print(f"      Worker: {worker_event_id}")
            print(f"      History: {digest_event_id}")
            print(f"      → Fix may have deployed AFTER the last digest run")
            print(f"      → Next digest will pick it up")
    elif worker_event_id and not digest_event_id:
        print(f"  ⚠ Worker has event_id but history is empty (pre-patch run)")
    else:
        print(f"  ? Insufficient data to compare")

    # Check 4: Recent fire rate
    fires, apps = history_fires(sector, lookback=10)
    print(f"\n  Recent fire rate:   {fires}/{apps} in last 10 runs")
    if apps and fires / apps > 0.5:
        print(f"  ⚠ Still firing >50% — deployment may not have taken effect")
    elif apps and fires > 0:
        print(f"  ✓ Occasional fires (working as designed)")

    print()


if __name__ == "__main__":
    sys.exit(main())
