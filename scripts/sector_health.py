#!/usr/bin/env python3
"""Sector health report — analyze digest history to find which sectors work."""

import json
import sys
from collections import defaultdict
from pathlib import Path

HISTORY_PATH = "data/digest_history.json"
ACTIVE_PATH = "config/active_sectors.json"


def load_history():
    try:
        with open(HISTORY_PATH) as f:
            return json.load(f).get("runs", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def load_active():
    try:
        with open(ACTIVE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def analyze():
    runs = load_history()
    active = load_active()

    if not runs:
        return {"error": "no history"}

    # Per-sector stats
    stats = defaultdict(lambda: {
        "signals": 0,
        "total_runs": 0,
        "conf_zero": 0,
        "conf_sum": 0.0,
    })

    for run in runs:
        for sector, data in run.get("sectors", {}).items():
            s = stats[sector]
            s["total_runs"] += 1
            conf = data.get("confidence", 0)
            s["conf_sum"] += conf
            if data.get("has_signal"):
                s["signals"] += 1
            if conf == 0:
                s["conf_zero"] += 1

    # Classify each sector
    classifications = {"healthy": [], "quiet": [], "broken": [], "spam": [], "missing": []}

    for sector in active:
        if sector not in stats:
            classifications["missing"].append(sector)
            continue
        s = stats[sector]
        signal_rate = s["signals"] / max(s["total_runs"], 1)
        avg_conf = s["conf_sum"] / max(s["total_runs"], 1)

        entry = {
            "sector": sector,
            "signals": s["signals"],
            "total_runs": s["total_runs"],
            "signal_rate": round(signal_rate, 2),
            "avg_confidence": round(avg_conf, 2),
            "conf_zero_count": s["conf_zero"],
        }

        if s["conf_zero"] >= 3:
            classifications["broken"].append(entry)
        elif signal_rate >= 0.5:
            classifications["spam"].append(entry)
        elif signal_rate == 0:
            classifications["quiet"].append(entry)
        else:
            classifications["healthy"].append(entry)

    return {
        "total_runs": len(runs),
        "sectors": classifications,
    }


def print_report(result):
    if "error" in result:
        print(f"ERROR: {result['error']}")
        return

    c = result["sectors"]
    total = sum(len(v) for v in c.values())

    print(f"\n═══ Sector Health Report ═══")
    print(f"Total runs analyzed: {result['total_runs']}")
    print(f"Active sectors: {total}\n")

    print(f"✅ Healthy ({len(c['healthy'])}): produce signals occasionally")
    for e in sorted(c["healthy"], key=lambda x: -x["signal_rate"])[:15]:
        print(f"   {e['sector']:20s} {e['signals']:2d}/{e['total_runs']:2d} runs  "
              f"conf={e['avg_confidence']:.2f}")
    if len(c["healthy"]) > 15:
        print(f"   ... +{len(c['healthy']) - 15} more")

    print(f"\n💤 Quiet ({len(c['quiet'])}): never signaled")
    for e in c["quiet"][:10]:
        print(f"   {e['sector']:20s} {e['total_runs']} runs, conf={e['avg_confidence']:.2f}")
    if len(c["quiet"]) > 10:
        print(f"   ... +{len(c['quiet']) - 10} more")

    if c["spam"]:
        print(f"\n🔊 Spam ({len(c['spam'])}): signal rate ≥ 50%")
        for e in sorted(c["spam"], key=lambda x: -x["signal_rate"]):
            print(f"   {e['sector']:20s} {e['signals']}/{e['total_runs']} runs ({e['signal_rate']*100:.0f}%)")

    if c["broken"]:
        print(f"\n🔴 Broken ({len(c['broken'])}): conf=0 in 3+ runs")
        for e in c["broken"]:
            print(f"   {e['sector']:20s} {e['conf_zero_count']}/{e['total_runs']} runs conf=0")

    if c["missing"]:
        print(f"\n⚠️  Missing ({len(c['missing'])}): in active but never in history")
        for s in c["missing"]:
            print(f"   {s}")


if __name__ == "__main__":
    result = analyze()
    print_report(result)
