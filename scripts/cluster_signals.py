#!/usr/bin/env python3
"""cluster_signals.py — aggregate firing sectors by cluster (alert dedup)."""
import json, os, sys, urllib.request, subprocess
from pathlib import Path

BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")

def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20",url], capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

def main():
    graph = json.loads(Path("config/graph.json").read_text())
    latest = fetch_json(f"{BASE}/latest")
    if not latest: sys.exit("/latest unreachable")

    by_sector = {r["sector"]: r for r in latest.get("rows", [])}
    firing = [r for r in latest.get("rows", []) if r.get("has_signal")]

    if not firing:
        print(json.dumps({"clusters": [], "singles": [], "total_firing": 0}, indent=2))
        return

    sector_to_cluster = graph.get("sector_to_cluster", {})
    cluster_members = {c["id"]: set(c["members"]) for c in graph.get("clusters", [])}

    firing_by_cluster = {}
    singles = []
    for r in firing:
        s = r["sector"]
        cid = sector_to_cluster.get(s)
        if cid:
            firing_by_cluster.setdefault(cid, []).append(r)
        else:
            singles.append(r)

    clusters_out = []
    for cid, members in firing_by_cluster.items():
        moves = [m.get("pct_change", 0) for m in members]
        clusters_out.append({
            "cluster_id": cid,
            "firing_count": len(members),
            "total_members": len(cluster_members.get(cid, [])),
            "avg_pct": round(sum(moves)/len(moves), 2),
            "min_pct": round(min(moves), 2),
            "max_pct": round(max(moves), 2),
            "direction": "down" if sum(moves) < 0 else "up",
            "sectors": [m["sector"] for m in members],
        })

    result = {
        "clusters": sorted(clusters_out, key=lambda c: -c["firing_count"]),
        "singles": [{"sector": r["sector"], "pct": r.get("pct_change", 0)} for r in singles],
        "total_firing": len(firing),
        "dedup_count": len(clusters_out) + len(singles),
    }
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
