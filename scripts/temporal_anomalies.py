#!/usr/bin/env python3
"""Detect temporal anomalies in graph snapshots.

Complements contradiction/correlation/trends by looking at:
- Silent changes: claim summary changed but has_signal stayed false
- Silent drops: claim disappeared between snapshots
- Silent appearances: claim appeared without prior trend
"""

import json
from pathlib import Path

GRAPH_PATH = "data/graph_snapshot.json"


def _load_snapshots():
    try:
        with open(GRAPH_PATH) as f:
            return json.load(f).get("snapshots", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _claims_by_sector(snapshot):
    """Extract claim summary per sector from a snapshot."""
    claims = {}
    for n in snapshot.get("nodes", []):
        if n.get("type") != "claim":
            continue
        sector = n.get("sector")
        if sector:
            claims[sector] = {
                "summary": n.get("summary", ""),
                "has_signal": n.get("has_signal", False),
            }
    return claims


def find_temporal_anomalies(min_snapshots=2):
    """Detect changes between consecutive snapshots."""
    snapshots = _load_snapshots()
    if len(snapshots) < min_snapshots:
        return {"status": "insufficient_snapshots", "count": len(snapshots)}

    anomalies = {"silent_changes": [], "silent_drops": [], "silent_appearances": []}

    # Compare last two snapshots (or all pairs if you want deeper history)
    for i in range(len(snapshots) - 1):
        prev = _claims_by_sector(snapshots[i])
        curr = _claims_by_sector(snapshots[i + 1])
        prev_ts = snapshots[i].get("timestamp", "?")[:19]
        curr_ts = snapshots[i + 1].get("timestamp", "?")[:19]

        for sector in prev:
            prev_claim = prev[sector]
            if sector not in curr:
                anomalies["silent_drops"].append({
                    "sector": sector,
                    "from": prev_ts,
                    "to": curr_ts,
                    "last_summary": prev_claim["summary"],
                })
                continue

            curr_claim = curr[sector]
            if prev_claim["summary"] != curr_claim["summary"]:
                # Only "silent" if neither snapshot had a signal
                if not prev_claim["has_signal"] and not curr_claim["has_signal"]:
                    anomalies["silent_changes"].append({
                        "sector": sector,
                        "from": prev_ts,
                        "to": curr_ts,
                        "prev_summary": prev_claim["summary"],
                        "curr_summary": curr_claim["summary"],
                    })

        for sector in curr:
            if sector not in prev and curr[sector]["summary"] != "quiet":
                anomalies["silent_appearances"].append({
                    "sector": sector,
                    "at": curr_ts,
                    "summary": curr[sector]["summary"],
                })

    total = (len(anomalies["silent_changes"])
             + len(anomalies["silent_drops"])
             + len(anomalies["silent_appearances"]))

    return {
        "status": "ok",
        "snapshot_count": len(snapshots),
        "total": total,
        "silent_changes": anomalies["silent_changes"],
        "silent_drops": anomalies["silent_drops"],
        "silent_appearances": anomalies["silent_appearances"],
    }


if __name__ == "__main__":
    result = find_temporal_anomalies()
    print(json.dumps(result, indent=2))
