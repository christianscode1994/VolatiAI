#!/usr/bin/env python3
"""weekly.py — what mattered this week.

The Sunday-morning view. Complements today.py (single run) and
history.py (raw timeline). Shows:

  - Sectors that fired this week (with count)
  - Persistent signals (fired 3+ days)
  - One-shot signals (fired once, then quiet)
  - Sectors that went quiet (fired before, silent last 3+ runs)
  - Current state vs. week-ago state

Usage:
    python3 scripts/weekly.py              # last 7 days
    python3 scripts/weekly.py --days 3     # last 3 days
"""
import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HISTORY = Path("data/digest_history.json")


def load_runs():
    if not HISTORY.exists():
        print("error: " + str(HISTORY) + " not found", file=sys.stderr)
        sys.exit(1)
    return json.load(HISTORY.open()).get("runs", [])


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def window(runs, days):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return [r for r in runs if parse_ts(r.get("timestamp")) and parse_ts(r["timestamp"]) >= cutoff]


def summarize(runs_in_window, all_runs, days):
    if not runs_in_window:
        print("No runs in last " + str(days) + " days.")
        return

    # Fire counts within the window
    fires = defaultdict(int)
    for run in runs_in_window:
        for sector, data in run.get("sectors", {}).items():
            if data.get("has_signal"):
                fires[sector] += 1

    # Currently firing (latest run)
    latest = all_runs[-1].get("sectors", {})
    currently = set(s for s, d in latest.items() if d.get("has_signal"))

    # Currently silent but fired in window (went quiet)
    went_quiet = []
    for sector in fires:
        if sector not in currently:
            silent_count = 0
            for run in reversed(all_runs):
                if run.get("sectors", {}).get(sector, {}).get("has_signal"):
                    break
                silent_count += 1
            if silent_count >= 3:
                went_quiet.append((sector, silent_count))

    print()
    print("  VolatiAI — last " + str(days) + " days (" + str(len(runs_in_window)) + " runs)")
    print("  " + "=" * 58)
    print()

    if fires:
        persistent = [(s, n) for s, n in fires.items() if n >= 3]
        oneshots = [(s, n) for s, n in fires.items() if n == 1]
        occasional = [(s, n) for s, n in fires.items() if 2 <= n < 3]

        if persistent:
            print("  PERSISTENT SIGNALS (" + str(len(persistent)) + ") — fired 3+ days:")
            for s, n in sorted(persistent, key=lambda x: -x[1]):
                status = "still firing" if s in currently else "went quiet"
                print("    " + s.ljust(28) + " " + str(n).rjust(2) + "x  " + status)
            print()

        if occasional:
            print("  OCCASIONAL (" + str(len(occasional)) + ") — fired 2 days:")
            for s, n in occasional:
                print("    " + s.ljust(28) + " " + str(n) + "x")
            print()

        if oneshots:
            print("  ONE-SHOTS (" + str(len(oneshots)) + ") — fired once:")
            for s, _ in sorted(oneshots)[:10]:
                print("    " + s)
            if len(oneshots) > 10:
                print("    ... and " + str(len(oneshots) - 10) + " more")
            print()
    else:
        print("  No signals fired this week.")
        print()

    if went_quiet:
        print("  WENT QUIET (" + str(len(went_quiet)) + ") — fired this week, silent 3+ runs since:")
        for s, n in went_quiet[:8]:
            print("    " + s.ljust(28) + " silent " + str(n) + " runs")
        print()

    print("  STATS: " + str(len(fires)) + " sectors fired this week · "
          + str(len(persistent)) + " persistent · "
          + str(len(oneshots)) + " one-shot")
    print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7, help="window in days (default 7)")
    args = ap.parse_args()

    runs = load_runs()
    w = window(runs, args.days)
    summarize(w, runs, args.days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
