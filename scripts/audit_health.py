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
    """Scan recent runs for sectors whose sources failed."""
    counts = Counter()
    for run in runs[-lookback:]:
        for sector, data in run.get("sectors", {}).items():
            # A failed sector typically has delta_current=None AND summary='quiet'
            # AND has_signal=False. That's not definitive, but combined across
            # multiple runs it's a signal.
            if (data.get("delta_current") is None
                    and data.get("summary") == "quiet"
                    and data.get("has_signal") is False):
                counts[sector] += 1

    # Only flag if it's been quiet ALL runs in the window
    persistent = [s for s, n in counts.items() if n == lookback]
    if persistent:
        print(f"  [YELLOW] {len(persistent)} sectors returned null/no-value in all last {lookback} runs:")
        for s in sorted(persistent)[:10]:
            print(f"    {s}")
        if len(persistent) > 10:
            print(f"    ... and {len(persistent) - 10} more")
    else:
        print(f"  [GREEN] no persistent null-value sectors in last {lookback} runs")


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
