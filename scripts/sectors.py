#!/usr/bin/env python3
"""sectors.py — catalog and browse all active sectors.

The reference tool. Shows every sector's metric, current value,
fire history, and source. Makes 248 sectors comprehensible.

Usage:
    python3 scripts/sectors.py                    # all sectors, categorized
    python3 scripts/sectors.py --fired            # only sectors that fired
    python3 scripts/sectors.py --quiet            # only never-fired sectors
    python3 scripts/sectors.py --search carbon    # name substring
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ACTIVE = Path("config/active_sectors.json")
LICENSES = Path("config/source_licenses.json")
HISTORY = Path("data/digest_history.json")


def fmt_value(v):
    if v is None:
        return "—"
    if isinstance(v, (int, float)):
        av = abs(v)
        if av >= 1e9:
            return f"{v / 1e9:.1f}B"
        if av >= 1e6:
            return f"{v / 1e6:.1f}M"
        if av >= 1000:
            return f"{v:,.0f}"
        return f"{v:.2f}" if isinstance(v, float) else str(v)
    return str(v)[:18]


def load_all():
    if not all(p.exists() for p in (ACTIVE, HISTORY)):
        print("error: missing config or history", file=sys.stderr)
        sys.exit(1)

    active = json.load(ACTIVE.open())
    licenses = json.load(LICENSES.open()) if LICENSES.exists() else {}
    runs = json.load(HISTORY.open()).get("runs", [])

    stats = defaultdict(lambda: {
        "fires": 0, "last_fired": None, "value": None, "metric": None, "last_event": None,
    })
    for run in runs:
        ts = run.get("timestamp", "")
        for sector, data in run.get("sectors", {}).items():
            if data.get("has_signal"):
                stats[sector]["fires"] += 1
                stats[sector]["last_fired"] = ts
            if data.get("delta_current") is not None:
                stats[sector]["value"] = data["delta_current"]
            if data.get("metric"):
                stats[sector]["metric"] = data["metric"]
            eid = data.get("event_id")
            if eid:
                stats[sector]["last_event"] = eid

    return active, licenses, stats, len(runs)


def render_row(name, stats, licenses, runs):
    s = stats.get(name, {})
    lic = licenses.get(name, {})
    metric = s.get("metric") or "—"
    if s.get("value") is not None:
        value = fmt_value(s["value"])
    elif s.get("last_event"):
        eid = str(s["last_event"])
        value = f"evt:{eid[:14]}"
    else:
        value = "—"
    fires = f"{s.get('fires', 0)}/{runs}"
    src = (lic.get("source") or "—")[:22]
    return f"  {name:<28} {metric:<22} {value:>14}  {fires:>7}  {src}"


def print_header():
    print(f"  {'sector':<28} {'metric':<22} {'value':>14}  {'fires':>7}  source")
    print("  " + "─" * 90)


def main():
    ap = argparse.ArgumentParser(description="Browse all active sectors")
    ap.add_argument("--fired", action="store_true", help="only sectors that fired")
    ap.add_argument("--quiet", action="store_true", help="only never-fired sectors")
    ap.add_argument("--search", help="substring search on sector name")
    args = ap.parse_args()

    active, licenses, stats, runs = load_all()
    sectors = sorted(active)
    if args.search:
        sectors = [s for s in sectors if args.search.lower() in s.lower()]

    firing = [s for s in sectors if stats.get(s, {}).get("fires", 0) > 0]
    quiet = [s for s in sectors if stats.get(s, {}).get("fires", 0) == 0]

    print(f"\n=== Sector Catalog ({len(sectors)} matching, {runs} runs of history) ===\n")

    if args.fired:
        print_header()
        for s in sorted(firing, key=lambda x: -stats[x]["fires"]):
            print(render_row(s, stats, licenses, runs))
    elif args.quiet:
        print_header()
        for s in quiet:
            print(render_row(s, stats, licenses, runs))
    else:
        if firing:
            print(f"FIRED ({len(firing)}):")
            print_header()
            for s in sorted(firing, key=lambda x: -stats[x]["fires"]):
                print(render_row(s, stats, licenses, runs))
            print()
        if quiet:
            print(f"QUIET ({len(quiet)}):")
            print_header()
            for s in quiet:
                print(render_row(s, stats, licenses, runs))
    print()


if __name__ == "__main__":
    main()
