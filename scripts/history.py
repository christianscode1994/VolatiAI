#!/usr/bin/env python3
"""history.py — analyze digest_history.json over time.

Shows patterns that today.py (single-run view) can't: which sectors
are persistent signals vs one-shots, which are newly quiet, which
have been silent for weeks.

Usage:
    python3 scripts/history.py                    # last 7 runs summary
    python3 scripts/history.py --days 3           # last 3 days
    python3 scripts/history.py --streaks          # currently firing/quiet
    python3 scripts/history.py --transitions      # recent state changes
    python3 scripts/history.py --sector NAME      # one sector's timeline
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
        print(f"error: {HISTORY} not found", file=sys.stderr)
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
    if not runs:
        return runs
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return [r for r in runs if parse_ts(r.get("timestamp")) and parse_ts(r["timestamp"]) >= cutoff]


def cmd_summary(runs, days):
    recent = window(runs, days)
    if not recent:
        print(f"No runs in last {days} days.")
        return
    print(f"=== Last {len(recent)} runs ({days} days) ===\n")

    # Fire count per sector
    fires = defaultdict(int)
    for run in recent:
        for sector, data in run.get("sectors", {}).items():
            if data.get("has_signal"):
                fires[sector] += 1

    if not fires:
        print("No sectors fired in this window.")
        return

    # Sort by fire count
    ranked = sorted(fires.items(), key=lambda x: -x[1])
    print(f"Sectors that fired ({len(ranked)}):")
    print(f"  {'sector':<28} {'fires':>6}  {'rate':>6}")
    for sector, count in ranked[:20]:
        rate = count / len(recent) * 100
        print(f"  {sector:<28} {count:>6}  {rate:>5.0f}%")
    if len(ranked) > 20:
        print(f"  ... and {len(ranked) - 20} more")


def cmd_streaks(runs):
    if not runs:
        print("No history.")
        return
    last = runs[-1]["sectors"]

    # Current streak (backwards from most recent)
    firing_now = []
    quiet_now = []
    for sector, data in last.items():
        if data.get("has_signal"):
            firing_now.append(sector)
        else:
            quiet_now.append(sector)

    print(f"=== Current state ({last.get('timestamp', '?')[:19]}) ===\n")
    print(f"Firing now ({len(firing_now)}):")
    for s in sorted(firing_now):
        streak = 0
        for run in reversed(runs):
            if run.get("sectors", {}).get(s, {}).get("has_signal"):
                streak += 1
            else:
                break
        print(f"  {s:<28} fires={streak}")

    # Longest quiet streaks
    streaks = []
    for sector in quiet_now:
        streak = 0
        for run in reversed(runs):
            if not run.get("sectors", {}).get(sector, {}).get("has_signal"):
                streak += 1
            else:
                break
        if streak >= 5:
            streaks.append((sector, streak))
    if streaks:
        streaks.sort(key=lambda x: -x[1])
        print(f"\nLongest quiet streaks ({len(streaks)} sectors):")
        for sector, n in streaks[:10]:
            print(f"  {sector:<28} silent {n} runs")


def cmd_transitions(runs, days=3):
    recent = window(runs, days)
    if len(recent) < 2:
        print(f"Need at least 2 runs in last {days} days.")
        return
    print(f"=== State transitions (last {days} days) ===\n")

    for i in range(1, len(recent)):
        prev = recent[i - 1].get("sectors", {})
        curr = recent[i].get("sectors", {})
        ts = recent[i].get("timestamp", "?")[:19]

        went_on = []
        went_off = []
        for sector in curr:
            p = prev.get(sector, {}).get("has_signal")
            c = curr.get(sector, {}).get("has_signal")
            if p is False and c is True:
                went_on.append(sector)
            elif p is True and c is False:
                went_off.append(sector)

        if went_on or went_off:
            print(f"  {ts}")
            for s in went_on:
                print(f"    + {s}")
            for s in went_off:
                print(f"    - {s}")


def cmd_sector(runs, name):
    print(f"=== {name} ===\n")
    print(f"  {'timestamp':<22} {'signal':<8} {'summary'}")
    for run in runs:
        data = run.get("sectors", {}).get(name, {})
        ts = run.get("timestamp", "?")[:19]
        sig = "FIRE" if data.get("has_signal") else "quiet"
        summary = (data.get("summary") or "")[:60]
        print(f"  {ts:<22} {sig:<8} {summary}")


def main():
    p = argparse.ArgumentParser(description="Analyze digest history")
    p.add_argument("--days", type=int, default=7, help="window size (default 7)")
    p.add_argument("--streaks", action="store_true", help="current firing/quiet streaks")
    p.add_argument("--transitions", action="store_true", help="recent state changes")
    p.add_argument("--sector", help="single sector timeline")
    args = p.parse_args()

    runs = load_runs()
    if not runs:
        print("no runs in history")
        return 1

    if args.sector:
        cmd_sector(runs, args.sector)
    elif args.streaks:
        cmd_streaks(runs)
    elif args.transitions:
        cmd_transitions(runs, args.days)
    else:
        cmd_summary(runs, args.days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
