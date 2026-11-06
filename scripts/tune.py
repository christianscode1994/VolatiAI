#!/usr/bin/env python3
"""tune.py — suggest tuning from historical distribution.

Detects sector type and analyzes appropriately:

  Value-type (has delta.metric): shows pct_change distribution and
  what fire rate each threshold would produce.

  Event-type (has event_id): shows distinct event IDs vs. fires.
  High fires with low distinct IDs means the dedup mechanism is
  underperforming. High fires with matching distinct IDs means the
  source itself is noisy (needs Worker-level bucketing).

Usage:
    python3 scripts/tune.py --noisy
    python3 scripts/tune.py --sector develop
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HISTORY = Path("data/digest_history.json")


def load_history():
    if not HISTORY.exists():
        print(f"error: {HISTORY} not found", file=sys.stderr)
        sys.exit(1)
    return json.load(HISTORY.open()).get("runs", [])


def analyze_sector(sector, runs):
    """Collect appearances, splitting pre/post dedup-patch.

    Event IDs are only recorded from the patch forward. Combining
    pre-patch fires with post-patch event IDs produces a false
    'X fires per event' ratio. This function reports them separately.
    """
    pcts = []
    event_ids = []
    fires_pre_patch = 0     # has_signal but no event_id in history
    fires_post_patch = 0    # has_signal with event_id recorded
    appearances = 0
    for run in runs:
        data = run.get("sectors", {}).get(sector)
        if not data:
            continue
        appearances += 1
        if data.get("has_signal"):
            eid = data.get("event_id")
            if eid is not None:
                event_ids.append(str(eid))
                fires_post_patch += 1
            else:
                fires_pre_patch += 1
        pct = data.get("pct_change")
        if pct is not None:
            pcts.append(pct)

    return {
        "sector": sector,
        "fires_pre_patch": fires_pre_patch,
        "fires_post_patch": fires_post_patch,
        "appearances": appearances,
        "pcts": pcts,
        "event_ids": event_ids,
        "type": "event" if event_ids else ("value" if pcts else "unknown"),
    }


def report_value(data, target):
    sector = data["sector"]
    pcts = data["pcts"]
    fires = data["fires"]
    app = data["appearances"]
    abs_changes = sorted(abs(c) for c in pcts)
    n = len(abs_changes)
    current_rate = fires / app * 100 if app else 0

    print(f"\n=== {sector} (value-type) ===")
    print(f"  Fired: {fires}/{app} = {current_rate:.0f}% (current)")
    print(f"  pct_change distribution (n={n}):")
    print(f"    min: {abs_changes[0]:.2f}%  p50: {abs_changes[n // 2]:.2f}%  "
          f"p90: {abs_changes[int(n * 0.9)]:.2f}%  max: {abs_changes[-1]:.2f}%")
    print()
    print(f"  Fire rate by threshold (all abs values):")
    print(f"    {'threshold':>10}  {'would fire':>12}  {'rate':>6}")
    for t in (1, 2, 5, 10, 15, 20, 25, 30, 50):
        count = sum(1 for c in abs_changes if c >= t)
        rate = count / n * 100
        print(f"    {t:>9}%  {count:>12}  {rate:>5.0f}%")


def report_event(data, target):
    sector = data["sector"]
    ids = data["event_ids"]
    fires_pre = data["fires_pre_patch"]
    fires_post = data["fires_post_patch"]
    app = data["appearances"]

    print(f"\n=== {sector} (event-type) ===")
    if not ids:
        print(f"  Pre-patch fires: {fires_pre} (no event_id recorded)")
        print(f"  Post-patch fires: 0")
        print(f"  → No post-patch data yet. Re-run after 2+ digest cycles.")
        return

    distinct = len(set(ids))
    repeats = fires_post - distinct
    avg_fires_per_event = fires_post / distinct if distinct else 0

    print(f"  Pre-patch fires: {fires_pre} (before dedup patch, no event_id)")
    print(f"  Post-patch fires: {fires_post} (with event_id)")
    print(f"  Distinct event IDs: {distinct}")
    print(f"  Fires per event (post-patch): {avg_fires_per_event:.1f}")
    print()

    if avg_fires_per_event <= 1.2:
        print(f"  ✓ Dedup healthy (post-patch). Each fire is a new event.")
        print(f"  → Fire rate will drop as pre-patch runs age out (~5-6 days).")
    elif avg_fires_per_event <= 2.0:
        print(f"  ⚠ Minor duplicate fires ({repeats} of {fires_post} post-patch).")
        print(f"  → Check dedup cooldown (currently 8 runs).")
    else:
        print(f"  ✗ Dedup underperforming: {repeats} of {fires_post} post-patch are repeats.")
        print(f"  → Fix in digest: extend dedupe_recent_events cooldown or investigate KV.")

    # Most repeat offenders
    counts = Counter(ids)
    top_repeats = [(eid, n) for eid, n in counts.items() if n > 1]
    top_repeats.sort(key=lambda x: -x[1])
    if top_repeats:
        print(f"\n  Top repeated event IDs:")
        for eid, n in top_repeats[:5]:
            print(f"    {eid[:40]:<42} fired {n}×")


def find_noisy(runs, min_rate=50):
    fires = defaultdict(int)
    apps = defaultdict(int)
    for run in runs:
        for sector, data in run.get("sectors", {}).items():
            apps[sector] += 1
            if data.get("has_signal"):
                fires[sector] += 1
    noisy = []
    for sector, app in apps.items():
        if app == 0:
            continue
        rate = fires[sector] / app * 100
        if rate >= min_rate:
            noisy.append((sector, rate))
    return sorted(noisy, key=lambda x: -x[1])


def main():
    ap = argparse.ArgumentParser(description="Suggest tuning from history")
    ap.add_argument("--sector", help="sector name")
    ap.add_argument("--target", type=int, default=15, help="target fire rate %%")
    ap.add_argument("--noisy", action="store_true", help="all sectors >50%%")
    args = ap.parse_args()

    runs = load_history()

    if args.noisy:
        noisy = find_noisy(runs)
        if not noisy:
            print("No sectors firing above 50%.")
            return 0
        print(f"\n=== {len(noisy)} sectors firing above 50% ===\n")
        for sector, _ in noisy:
            data = analyze_sector(sector, runs)
            if data["type"] == "value":
                report_value(data, args.target)
            elif data["type"] == "event":
                report_event(data, args.target)
            else:
                print(f"\n=== {sector} ===")
                print(f"  No pct_change or event_id data — sector may be pre-dedup-patch")
        return 0

    if not args.sector:
        ap.print_help()
        return 1

    data = analyze_sector(args.sector, runs)
    if data["type"] == "value":
        report_value(data, args.target)
    elif data["type"] == "event":
        report_event(data, args.target)
    else:
        print(f"\n=== {args.sector} ===")
        print(f"  No pct_change or event_id data in history.")
        print(f"  Either the sector hasn't fired since the dedup patch, or")
        print(f"  the sector is value-type with no history yet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
