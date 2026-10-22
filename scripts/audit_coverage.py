#!/usr/bin/env python3
"""audit_coverage.py — sector-by-sector fire-rate coverage check.

Categorizes every active sector:
  - noisy (>50%): firing too often, calibration target
  - healthy (5-50%): working as designed
  - slow (1-4%): slow-cycle signals
  - never fired (0%): quiet by design, OR silently broken
  - broken (data_quality=0 always): every fetch failed (BUG)
  - missing from history: active but never processed (BUG)

Complements the other audits:
  audit_sectors.py  → structural (active vs Worker alignment)
  audit_licenses.py → compliance (restricted sources)
  audit_health.py   → runtime (freshness, persistent nulls, noise)
  audit_coverage.py → per-sector breakdown by fire rate category

Run all four before deploy.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

HISTORY = Path("data/digest_history.json")
ACTIVE = Path("config/active_sectors.json")


def main():
    if not HISTORY.exists():
        print(f"error: {HISTORY} not found", file=sys.stderr)
        return 1

    runs = json.load(HISTORY.open()).get("runs", [])
    active = set(json.load(ACTIVE.open()))

    stats = defaultdict(lambda: {"fires": 0, "failures": 0, "appearances": 0})
    for run in runs:
        for sector, data in run.get("sectors", {}).items():
            stats[sector]["appearances"] += 1
            if data.get("has_signal"):
                stats[sector]["fires"] += 1
            if data.get("data_quality") == 0:
                stats[sector]["failures"] += 1

    cats = {"noisy": [], "healthy": [], "slow": [], "never": [], "broken": [], "missing": []}
    for sector in active:
        s = stats.get(sector)
        if not s or s["appearances"] == 0:
            cats["missing"].append(sector)
            continue
        rate = s["fires"] / s["appearances"] * 100
        if s["failures"] == s["appearances"]:
            cats["broken"].append(sector)
        elif rate > 50:
            cats["noisy"].append((sector, s["fires"], s["appearances"]))
        elif rate >= 5:
            cats["healthy"].append((sector, s["fires"], s["appearances"]))
        elif rate > 0:
            cats["slow"].append((sector, s["fires"], s["appearances"]))
        else:
            cats["never"].append(sector)

    print(f"=== Sector Coverage ({len(active)} active, {len(runs)} runs) ===\n")
    print(f"NOISY >50% ({len(cats['noisy'])}):")
    for s, f, a in sorted(cats["noisy"], key=lambda x: -x[1] / x[2]):
        print(f"  {s:<28} {f}/{a} = {f / a * 100:.0f}%")
    print(f"\nHEALTHY 5-50% ({len(cats['healthy'])}):")
    for s, f, a in sorted(cats["healthy"], key=lambda x: -x[1] / x[2])[:20]:
        print(f"  {s:<28} {f}/{a} = {f / a * 100:.0f}%")
    print(f"\nSLOW 1-4% ({len(cats['slow'])}): {', '.join(s for s, _, _ in sorted(cats['slow'])[:10])}")
    if len(cats["slow"]) > 10:
        print(f"  ... and {len(cats['slow']) - 10} more")
    print(f"\nNEVER FIRED ({len(cats['never'])}) — quiet by design unless listed as broken below")
    print(f"BROKEN (data_quality=0) ({len(cats['broken'])}): {sorted(cats['broken']) if cats['broken'] else '✓ none'}")
    print(f"MISSING FROM HISTORY ({len(cats['missing'])}): {sorted(cats['missing']) if cats['missing'] else '✓ none'}")

    return 0 if not cats["broken"] and not cats["missing"] else 1


if __name__ == "__main__":
    sys.exit(main())
