#!/usr/bin/env python3
"""Rank active signals from the latest snapshot.

Outputs docs/active.json — a small, product-quality payload of the
top N signals ordered by severity x confidence x magnitude x novelty.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

TOP_N = 25
SNAPSHOT_PATH = Path("docs/graph_snapshot.json")
INTEL_HTML_PATH = Path("docs/intel.html")
HISTORY_PATH = Path("reports/signal_history.jsonl")
OUTPUT_PATH = Path("docs/active.json")

SEVERITY_WEIGHT = {
    "info": 0.1,
    "notice": 1.0,
    "warning": 2.0,
    "alert": 3.0,
    "critical": 5.0,
}

ZERO_OK_SUFFIXES = ("_warnings", "_alerts", "_incidents", "_events", "_deals")


def load_sectors() -> list[dict]:
    if SNAPSHOT_PATH.exists():
        raw = json.loads(SNAPSHOT_PATH.read_text())
        if isinstance(raw, dict) and "sectors" in raw:
            return raw["sectors"]
        if isinstance(raw, list):
            return raw
        for k in ("data", "results", "items"):
            if isinstance(raw.get(k), list):
                return raw[k]

    if INTEL_HTML_PATH.exists():
        import re
        html = INTEL_HTML_PATH.read_text()
        m = re.search(r"<pre>(.*?)</pre>", html, re.DOTALL)
        if m:
            return json.loads(m.group(1))

    raise SystemExit("No sector source found")


def load_history() -> dict:
    history: dict = {}
    if not HISTORY_PATH.exists():
        return history
    for line in HISTORY_PATH.read_text().splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        sector = rec.get("sector")
        ts = rec.get("timestamp") or rec.get("ts")
        if not sector or not ts:
            continue
        try:
            when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if sector not in history or when > history[sector]:
            history[sector] = when
    return history


def is_plausible(d: dict) -> bool:
    src = d.get("sources", {})
    if src.get("total", 0) > 0 and src.get("healthy", 0) == 0:
        return False
    if d.get("data_quality", 1.0) < 0.5:
        return False
    delta = d.get("delta") or {}
    cur = delta.get("current")
    prev = delta.get("previous")
    metric = delta.get("metric", "") or ""
    if cur == 0 and isinstance(prev, (int, float)) and prev >= 1000:
        if not any(metric.endswith(s) for s in ZERO_OK_SUFFIXES):
            return False
    return True


def novelty_factor(sector: str, history: dict) -> float:
    last = history.get(sector)
    if last is None:
        return 1.0
    now = datetime.now(timezone.utc)
    age_hours = (now - last).total_seconds() / 3600
    if age_hours < 6:
        return 0.3
    if age_hours < 24:
        return 0.6
    if age_hours < 7 * 24:
        return 0.85
    return 1.0


def score(d: dict, history: dict) -> float:
    sev = SEVERITY_WEIGHT.get(d.get("severity", "info"), 1.0)
    conf = d.get("confidence", 0.0) or 0.0
    mag = d.get("magnitude", 0.0) or 0.0
    nov = novelty_factor(d.get("sector", ""), history)
    return sev * conf * math.sqrt(mag + 0.1) * nov


def main() -> None:
    sectors = load_sectors()
    history = load_history()
    candidates = []
    for s in sectors:
        d = s.get("data") if "data" in s else s
        if not d or not d.get("has_signal"):
            continue
        if not is_plausible(d):
            continue
        sc = score(d, history)
        if sc <= 0:
            continue
        candidates.append({
            "sector": d.get("sector"),
            "severity": d.get("severity"),
            "magnitude": d.get("magnitude"),
            "confidence": d.get("confidence"),
            "summary": d.get("summary"),
            "score": round(sc, 3),
            "timestamp": d.get("timestamp"),
            "attribution": "https://christianscode1994.github.io/VolatiAI/attribution.json",
        })
    candidates.sort(key=lambda c: c["score"], reverse=True)
    top = candidates[:TOP_N]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "window": "6h",
        "scanned": len(sectors),
        "candidates": len(candidates),
        "count": len(top),
        "signals": top,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {len(top)} active signals (of {len(sectors)} scanned, {len(candidates)} passed plausibility)")
    for row in top[:5]:
        print(f"  {row['score']:>5.2f}  [{row['severity']:<8}] {row['sector']:<30} {row['summary']}")


if __name__ == "__main__":
    main()
