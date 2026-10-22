#!/usr/bin/env python3
"""audit_health.py — runtime health check for the VolatiAI pipeline.

Reads data/digest_history.json (local) to check:
  1. Freshness of the last run
  2. Sectors with failed sources in recent runs (silent failures)
  3. Sectors that fire so often they're likely noise (fires_24 >= 20)

Run alongside audit_sectors.py and audit_licenses.py before deploy.
"""
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HISTORY = Path("data/digest_history.json")


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def check_freshness(runs):
    if not runs:
        print("  [RED] no runs in history")
        return False
    last_ts = runs[-1].get("timestamp")
    dt = parse_ts(last_ts)
    if not dt:
        print(f"  [RED] last run timestamp unparseable: {last_ts}")
        return False
    now = datetime.now(timezone.utc)
    age_hours = (now - dt).total_seconds() / 3600
    if age_hours < 2:
        status = "GREEN"
    elif age_hours < 24:
        status = "YELLOW"
    else:
        status = "RED"
    print(f"  [{status}] last run: {last_ts}  ({age_hours:.1f}h ago)")
    return age_hours < 24


def check_failures(runs, lookback=3):
    """Detect sectors that never appear in recent history — likely always failing.

    Errored envelopes are filtered out before arbitrate(), so a failing
    sector simply doesn't show up in the history. The real signal is
    "active sector with zero appearances."
    """
    import json as _json
    active = _json.load(open("config/active_sectors.json"))

    appeared = set()
    for run in runs[-lookback:]:
        appeared |= set(run.get("sectors", {}).keys())

    never_appeared = sorted(set(active) - appeared)
    if never_appeared:
        print(f"  [RED] {len(never_appeared)} active sectors missing from last {lookback} runs:")
        for s in never_appeared[:10]:
            print(f"    {s}")
        if len(never_appeared) > 10:
            print(f"    ... and {len(never_appeared) - 10} more")
    else:
        print(f"  [GREEN] all active sectors appear in last {lookback} runs")

    # Second check: sectors that appear but always have data_quality=0
    # (partial failure — the fetch succeeded but parsing failed)
    dq_zero = []
    for run in runs[-lookback:]:
        for sector, data in run.get("sectors", {}).items():
            if data.get("data_quality") == 0:
                dq_zero.append(sector)
    if dq_zero:
        persistent = [s for s, n in Counter(dq_zero).items() if n == lookback]
        if persistent:
            print(f"  [YELLOW] {len(persistent)} sectors have data_quality=0 in all {lookback} runs:")
            for s in persistent[:5]:
                print(f"    {s}")


def check_noise(runs):
    """Sectors firing almost every run are likely event-type noise."""
    if not runs:
        return
    last = runs[-1]
    noisy = []
    for sector, data in last.get("sectors", {}).items():
        fires = data.get("fires_24")
        if isinstance(fires, int) and fires >= 20:
            noisy.append((sector, fires))
    if noisy:
        noisy.sort(key=lambda x: -x[1])
        print(f"  [YELLOW] {len(noisy)} sectors fire >= 20 of last 24 runs (candidate for calibration):")
        for s, n in noisy:
            print(f"    {s:<25} fires_24={n}")
    else:
        print("  [GREEN] no sectors firing >= 20/24 runs")


def main():
    if not HISTORY.exists():
        print(f"error: {HISTORY} not found", file=sys.stderr)
        return 1

    data = json.load(HISTORY.open())
    runs = data.get("runs", [])
    print(f"=== Pipeline Health ({len(runs)} runs in history) ===\n")

    print("Freshness:")
    fresh = check_freshness(runs)
    print()
    print("Persistent null-value sectors:")
    check_failures(runs)
    print()
    print("High-frequency firing (possible noise):")
    check_noise(runs)

    return 0 if fresh else 1


if __name__ == "__main__":
    sys.exit(main())
