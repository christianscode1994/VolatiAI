#!/usr/bin/env python3
"""Self-correction advisor.

Reads digest_history.json and outputs concrete recommendations
for threshold adjustments, sector removal, or investigation.

Does NOT auto-apply — output is meant for human review.
"""

import json
import re
from pathlib import Path

HISTORY_PATH = "data/digest_history.json"
DENSE_WORKER = "workers/sector-dense/src/index.js"
SPARSE_WORKER = "workers/sector-sparse/src/index.js"
SLOW_WORKER = "workers/sector-slow/src/index.js"
ACTIVE_PATH = "config/active_sectors.json"


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}


def load_text(path):
    try:
        return Path(path).read_text()
    except FileNotFoundError:
        return ""


def extract_thresholds(worker_path, sector):
    """Extract threshold_pct, threshold_abs, or event_source from worker source."""
    src = load_text(worker_path)
    pattern = rf'(?:"{re.escape(sector)}"|\b{re.escape(sector)})\s*:\s*\{{'
    m = re.search(pattern, src)
    if not m:
        return None
    start = m.end()
    depth = 1
    i = start
    while i < len(src) and depth > 0:
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
        i += 1
    block = src[start:i]
    pct = re.search(r'threshold_pct:\s*([\d.]+)', block)
    abs_v = re.search(r'threshold_abs:\s*([\d.e]+)', block)
    event_src = re.search(r'event_source:\s*"([^"]+)"', block)
    return {
        "threshold_pct": float(pct.group(1)) if pct else None,
        "threshold_abs": float(abs_v.group(1)) if abs_v else None,
        "event_source": event_src.group(1) if event_src else None,
    }


def analyze_sector_stats():
    """Build signal rate per sector from history."""
    history = load_json(HISTORY_PATH, {"runs": []})
    runs = history.get("runs", [])
    if not runs:
        return {}

    stats = {}
    for run in runs:
        for sector, data in run.get("sectors", {}).items():
            s = stats.setdefault(sector, {"signals": 0, "runs": 0, "conf_sum": 0.0, "conf_zero": 0})
            s["runs"] += 1
            s["conf_sum"] += data.get("confidence", 0)
            if data.get("has_signal"):
                s["signals"] += 1
            if data.get("confidence", 0) == 0:
                s["conf_zero"] += 1

    for s in stats.values():
        s["rate"] = s["signals"] / max(s["runs"], 1)
        s["avg_conf"] = s["conf_sum"] / max(s["runs"], 1)
    return stats


def recommend(stats):
    """Generate actionable recommendations."""
    recs = {
        "raise_thresholds": [],
        
        "remove_sector": [],
        "investigate": [],
    }

    active = set(load_json(ACTIVE_PATH, []))

    for sector, s in stats.items():
        if sector not in active:
            continue

        rate = s["rate"]
        conf_zero_pct = s["conf_zero"] / max(s["runs"], 1)

        # Broken: conf=0 in 30%+ of runs
        if conf_zero_pct >= 0.3 and s["runs"] >= 5:
            recs["remove_sector"].append({
                "sector": sector,
                "reason": f"conf=0 in {s['conf_zero']}/{s['runs']} runs ({conf_zero_pct*100:.0f}%)",
                "action": "Remove from active_sectors.json or fix source",
            })
            continue

        # Spam: signal rate >= 50%
        if rate >= 0.5 and s["runs"] >= 5:
            thresholds = extract_thresholds(DENSE_WORKER, sector) or extract_thresholds(SPARSE_WORKER, sector)
            if thresholds and thresholds["threshold_pct"]:
                current = thresholds["threshold_pct"]
                suggested = current * 2 if rate >= 0.8 else current * 1.5
                recs["raise_thresholds"].append({
                    "sector": sector,
                    "reason": f"signal rate {rate*100:.0f}% ({s['signals']}/{s['runs']})",
                    "current_pct": current,
                    "suggested_pct": round(suggested, 2),
                })
            else:
                recs["investigate"].append({
                    "sector": sector,
                    "reason": f"spam ({rate*100:.0f}%) but no config found in workers",
                })

        # Quiet: 0 signals in 10+ runs — DON'T flag as "lower threshold"
        # (dense thresholds are usually correct, sparse dedup is correct,
        #  slow needs 7+ days of history)
        elif rate == 0 and s["runs"] >= 10:
            # Only note in a separate "monitor" bucket — no action suggested
            recs.setdefault("monitor_quiet", []).append({
                "sector": sector,
                "runs": s["runs"],
                "avg_conf": round(s["avg_conf"], 2),
            })

    return recs


def print_report(stats, recs):
    print("\n═══ Self-Correction Recommendations ═══")
    print(f"Sectors analyzed: {len(stats)}\n")

    if recs["remove_sector"]:
        print(f"🔴 REMOVE ({len(recs['remove_sector'])}):")
        for r in recs["remove_sector"]:
            print(f"   {r['sector']:20s} {r['reason']}")
        print()

    if recs["raise_thresholds"]:
        print(f"🔊 RAISE THRESHOLD ({len(recs['raise_thresholds'])}):")
        for r in recs["raise_thresholds"]:
            print(f"   {r['sector']:20s} pct {r['current_pct']} → {r['suggested_pct']}  ({r['reason']})")
        print()

    if recs.get("monitor_quiet"):
        print(f"💤 MONITOR ({len(recs['monitor_quiet'])} quiet sectors — no action):")
        for r in recs["monitor_quiet"][:5]:
            print(f"   {r['sector']:20s} {r['runs']} runs, conf={r['avg_conf']}")
        if len(recs["monitor_quiet"]) > 5:
            print(f"   ... +{len(recs['monitor_quiet']) - 5} more (see JSON)")
        print()

    if recs["investigate"]:
        print(f"⚠️  INVESTIGATE ({len(recs['investigate'])}):")
        for r in recs["investigate"]:
            print(f"   {r['sector']:20s} {r['reason']}")
        print()

    if not any(recs.values()):
        print("✅ No actionable recommendations — system is healthy.")

    # Write to file for review
    Path("data/self_correction.json").parent.mkdir(parents=True, exist_ok=True)
    with open("data/self_correction.json", "w") as f:
        json.dump(recs, f, indent=2)
    print(f"Full report written to data/self_correction.json")


if __name__ == "__main__":
    stats = analyze_sector_stats()
    recs = recommend(stats)
    print_report(stats, recs)
