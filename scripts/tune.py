#!/usr/bin/env python3
"""tune.py — suggest thresholds from actual historical distribution.

For a given sector, shows the pct_change distribution across all
runs and what fire rate each threshold would produce. Lets you
tune before deploying.

Usage:
    python3 scripts/tune.py --sector develop
    python3 scripts/tune.py --sector carbon-intensity --target 10
    python3 scripts/tune.py --noisy    # all current noisy sectors
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

HISTORY = Path("data/digest_history.json")


def load_sector_changes(sector_name):
    """Return all pct_change values for a sector across history."""
    if not HISTORY.exists():
        print("error: digest_history.json not found", file=sys.stderr)
        sys.exit(1)
    runs = json.load(HISTORY.open()).get("runs", [])
    changes = []
    fires = 0
    appearances = 0
    for run in runs:
        data = run.get("sectors", {}).get(sector_name)
        if not data:
            continue
        appearances += 1
        pct = data.get("pct_change")
        if pct is not None:
            changes.append(pct)
        if data.get("has_signal"):
            fires += 1
    return changes, fires, appearances


def suggest_threshold(changes, target_fire_pct):
    """Find smallest threshold that gives <= target_fire_pct fire rate."""
    if not changes:
        return None
    abs_changes = sorted(abs(c) for c in changes)
    n = len(abs_changes)
    target_count = int(n * target_fire_pct / 100)
    if target_count == 0:
        return None  # would need threshold above max
    if target_count >= n:
        return abs_changes[0]
    # Threshold needs to allow only target_count values above it
    return abs_changes[n - target_count]


def report(sector, changes, fires, appearances, target):
    if not changes:
        print(f"\n{sector}: no pct_change data in history")
        return

    abs_changes = sorted(abs(c) for c in changes)
    n = len(abs_changes)
    current_rate = fires / appearances * 100 if appearances else 0

    print(f"\n=== {sector} ===")
    print(f"  Fired: {fires}/{appearances} = {current_rate:.0f}% (current)")
    print(f"  pct_change distribution (n={n}):")
    print(f"    min: {abs_changes[0]:.2f}%  p50: {abs_changes[n//2]:.2f}%  "
          f"p90: {abs_changes[int(n*0.9)]:.2f}%  max: {abs_changes[-1]:.2f}%")
    print()
    print(f"  Fire rate by threshold (all abs values):")
    print(f"    {'threshold':>10}  {'would fire':>12}  {'rate':>6}")
    for t in (1, 2, 5, 10, 15, 20, 25, 30, 50):
        count = sum(1 for c in abs_changes if c >= t)
        rate = count / n * 100
        marker = " ← target" if target and abs(rate - target) < 3 else ""
        print(f"    {t:>9}%  {count:>12}  {rate:>5.0f}%{marker}")
    print()
    suggested = suggest_threshold(changes, target)
    if suggested is not None:
        print(f"  Suggested threshold for {target}% target: {suggested:.1f}%")
    else:
        print(f"  For {target}% target: threshold would need to be above {abs_changes[-1]:.1f}%")


def find_noisy_sectors(min_rate=50):
    """Find sectors currently firing above min_rate."""
    runs = json.load(HISTORY.open()).get("runs", [])
    fires = defaultdict(int)
    appearances = defaultdict(int)
    for run in runs:
        for sector, data in run.get("sectors", {}).items():
            appearances[sector] += 1
            if data.get("has_signal"):
                fires[sector] += 1
    noisy = []
    for sector, app in appearances.items():
        if app == 0:
            continue
        rate = fires[sector] / app * 100
        if rate >= min_rate:
            noisy.append((sector, rate))
    return noisy


def main():
    ap = argparse.ArgumentParser(description="Suggest thresholds from history")
    ap.add_argument("--sector", help="sector name")
    ap.add_argument("--target", type=int, default=15, help="target fire rate %% (default 15)")
    ap.add_argument("--noisy", action="store_true", help="show all sectors firing >50%")
    args = ap.parse_args()

    if args.noisy:
        noisy = find_noisy_sectors()
        if not noisy:
            print("No sectors currently firing above 50%.")
            return 0
        print(f"\n=== {len(noisy)} sectors firing above 50% ===\n")
        for sector, rate in sorted(noisy, key=lambda x: -x[1]):
            changes, fires, app = load_sector_changes(sector)
            report(sector, changes, fires, app, args.target)
        return 0

    if not args.sector:
        ap.print_help()
        return 1

    changes, fires, app = load_sector_changes(args.sector)
    report(args.sector, changes, fires, app, args.target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
