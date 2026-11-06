#!/usr/bin/env python3
"""cluster_signals.py — cluster aggregates + outlier detection."""
import json, os, sys, urllib.request, subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
OUTLIER_THRESHOLD = float(os.environ.get("VOLATIAI_OUTLIER", "3.0"))  # std devs from cluster mean
MIN_CLUSTER_SIZE = 2

def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20",url],
                             capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

def stdev(vals):
    if len(vals) < 2: return 0.0
    m = sum(vals) / len(vals)
    v = sum((x - m) ** 2 for x in vals) / (len(vals) - 1)
    return v ** 0.5


def load_cluster_history():
    """Load prior cluster state from KV (written by prior runs)."""
    try:
        p = BASE_DIR / "config" / "cluster_history.json"
        return json.loads(p.read_text()) if p.exists() else {}
    except Exception:
        return {}

def save_cluster_history(clusters):
    """Persist current cluster avg_pct for next-run comparison."""
    p = BASE_DIR / "config" / "cluster_history.json"
    now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    prior = load_cluster_history()
    for c in clusters:
        cid = c["cluster_id"]
        entry = prior.get(cid, {"series": []})
        entry["series"].append({"ts": now, "avg_pct": c["avg_pct"]})
        # Keep last 30 observations
        entry["series"] = entry["series"][-30:]
        prior[cid] = entry
    p.write_text(json.dumps(prior, indent=2))

def add_momentum(clusters):
    """Enrich each cluster with momentum from prior observations."""
    prior = load_cluster_history()
    for c in clusters:
        series = prior.get(c["cluster_id"], {}).get("series", [])
        if len(series) >= 2:
            prev = series[-2]["avg_pct"]
            cur = c["avg_pct"]
            c["prev_avg_pct"] = prev
            c["momentum"] = round(cur - prev, 2)
            c["acceleration"] = "accelerating" if abs(cur) > abs(prev) and (cur * prev > 0) else "decelerating" if (cur * prev > 0) else "reversing"
        else:
            c["prev_avg_pct"] = None
            c["momentum"] = None
            c["acceleration"] = None
    return clusters

def main():
    graph = json.loads((BASE_DIR / "config" / "graph.json").read_text())
    latest = fetch_json(f"{BASE}/latest")
    if not latest: sys.exit("/latest unreachable")

    by_sector = {r["sector"]: r for r in latest.get("rows", [])}
    s2c = graph.get("sector_to_cluster", {})
    cluster_members = {c["id"]: set(c["members"]) for c in graph.get("clusters", [])}

    # Compute per-cluster stats (only members with actual pct_change data)
    cluster_stats = {}
    for cid, members in cluster_members.items():
        moves = []
        for s in members:
            r = by_sector.get(s)
            if r and isinstance(r.get("pct_change"), (int, float)):
                moves.append(r["pct_change"])
        if len(moves) >= MIN_CLUSTER_SIZE:
            cluster_stats[cid] = {
                "mean": sum(moves) / len(moves),
                "std": stdev(moves),
                "n": len(moves),
                "members_with_data": [s for s in members if by_sector.get(s, {}).get("pct_change") is not None],
            }

    # Outliers: sectors moving >N std devs from their cluster
    outliers = []
    for cid, stats in cluster_stats.items():
        if stats["std"] == 0: continue  # flat cluster, no outliers possible
        for s in stats["members_with_data"]:
            r = by_sector[s]
            pct = r["pct_change"]
            z = (pct - stats["mean"]) / stats["std"]
            if abs(z) >= OUTLIER_THRESHOLD:
                outliers.append({
                    "sector": s,
                    "cluster_id": cid,
                    "pct": pct,
                    "cluster_mean": round(stats["mean"], 2),
                    "z_score": round(z, 2),
                    "direction": "up" if z > 0 else "down",
                })

    outliers.sort(key=lambda o: abs(o["z_score"]), reverse=True)

    # Cluster summary
    clusters_out = []
    for cid, stats in cluster_stats.items():
        firing = [s for s in stats["members_with_data"]
                  if by_sector[s].get("has_signal")]
        if firing:
            clusters_out.append({
                "cluster_id": cid,
                "firing_count": len(firing),
                "total_with_data": stats["n"],
                "avg_pct": round(stats["mean"], 2),
                "std": round(stats["std"], 2),
                "direction": "down" if stats["mean"] < 0 else "up",
                "sectors_firing": firing,
            })

    clusters_out = sorted(clusters_out, key=lambda c: -c["firing_count"])
    clusters_out = add_momentum(clusters_out)
    save_cluster_history(clusters_out)

    result = {
        "clusters_firing": clusters_out,
        "outliers": outliers,
        "outlier_threshold_z": OUTLIER_THRESHOLD,
    }
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
