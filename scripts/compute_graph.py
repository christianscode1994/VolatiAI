#!/usr/bin/env python3
"""compute_graph.py — correlation graph + cluster detection from history."""
import json, os, sys, urllib.request, subprocess
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from itertools import combinations
from pathlib import Path

BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
CORR_THRESHOLD = float(os.environ.get("VOLATIAI_CORR_THRESHOLD", "0.6"))
MIN_POINTS = int(os.environ.get("VOLATIAI_MIN_POINTS", "10"))

def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20",url], capture_output=True, text=True)
        if out.returncode == 0:
            try: return json.loads(out.stdout)
            except: return None
    return None

def normalize_ts(t):
    if isinstance(t, (int, float)):
        if t > 1e12: t = t / 1000
        try: return datetime.utcfromtimestamp(t).strftime("%Y-%m-%d")
        except: return None
    if isinstance(t, str): return t[:10]
    return None

def daily_closes(history):
    by_date = {}
    for entry in history:
        d = normalize_ts(entry.get("t"))
        v = entry.get("v")
        if d and isinstance(v, (int, float)):
            by_date[d] = v
    return by_date

def pearson(ra, rb):
    n = len(ra)
    if n < 5: return None
    ma, mb = sum(ra)/n, sum(rb)/n
    va = sum((x-ma)**2 for x in ra)
    vb = sum((x-mb)**2 for x in rb)
    if va == 0 or vb == 0: return None
    cov = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    return cov / (va**0.5 * vb**0.5)

def main():
    latest = fetch_json(f"{BASE}/latest")
    if not latest: sys.exit("/latest unreachable")
    sectors = [r["sector"] for r in latest.get("rows", [])]

    print(f"Fetching {len(sectors)} histories...", file=sys.stderr)
    histories = {}
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(fetch_json, f"{BASE}/history/{s}"): s for s in sectors}
        for fut in as_completed(futures):
            s = futures[fut]
            data = fut.result()
            if not data or "history" not in data: continue
            closes = daily_closes(data["history"])
            if len(closes) >= MIN_POINTS:
                histories[s] = closes

    print(f"{len(histories)} sectors with {MIN_POINTS}+ daily points", file=sys.stderr)

    names = sorted(histories.keys())
    edges = []
    for a, b in combinations(names, 2):
        ha, hb = histories[a], histories[b]
        common = sorted(set(ha.keys()) & set(hb.keys()))
        if len(common) < MIN_POINTS: continue
        va = [ha[t] for t in common]
        vb = [hb[t] for t in common]
        ra = [(va[i]-va[i-1])/va[i-1] if va[i-1] else 0 for i in range(1,len(va))]
        rb = [(vb[i]-vb[i-1])/vb[i-1] if vb[i-1] else 0 for i in range(1,len(vb))]
        c = pearson(ra, rb)
        if c is not None and abs(c) >= CORR_THRESHOLD:
            edges.append({"a": a, "b": b, "corr": round(c, 3), "n": len(common)})

    adj = defaultdict(set)
    for e in edges:
        adj[e["a"]].add(e["b"]); adj[e["b"]].add(e["a"])

    visited = set(); clusters = []
    for node in names:
        if node in visited: continue
        comp = []; stack = [node]
        while stack:
            n = stack.pop()
            if n in visited: continue
            visited.add(n); comp.append(n)
            stack.extend(adj[n] - visited)
        if len(comp) >= 2:
            clusters.append(sorted(comp))

    sector_to_cluster = {}
    for i, c in enumerate(clusters):
        for s in c: sector_to_cluster[s] = f"cluster_{i}"

    docs = Path("docs"); docs.mkdir(exist_ok=True)
    graph = {
        "computed_at": datetime.utcnow().isoformat() + "Z",
        "threshold": CORR_THRESHOLD,
        "min_points": MIN_POINTS,
        "nodes": names,
        "edges": edges,
        "clusters": [{"id": f"cluster_{i}", "members": c} for i, c in enumerate(clusters)],
        "sector_to_cluster": sector_to_cluster,
    }
    (docs / "graph.json").write_text(json.dumps(graph, indent=2))
    Path("config/graph.json").write_text(json.dumps(graph, indent=2))

    print(f"✅ {len(names)} nodes, {len(edges)} edges, {len(clusters)} clusters", file=sys.stderr)
    for c in graph["clusters"]:
        print(f"  {c['id']}: {', '.join(c['members'][:5])}{'...' if len(c['members'])>5 else ''}", file=sys.stderr)

if __name__ == "__main__":
    main()
