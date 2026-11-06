#!/usr/bin/env python3
"""Find sector pairs that look like same-quantity but aren't declared.

Reads /history/<sector> from the worker for every sector with data,
computes pairwise correlation on aligned daily values, flags pairs
above threshold. Excludes pairs already confirmed by the worker as
provenance.

Two correlations per pair:
  raw_r: Pearson on aligned raw levels (catches shared trend)
  det_r: Pearson on detrended residuals (matches worker's logic)

Interpretation:
  both high  → strong same-quantity candidate
  only raw   → shared trend, not a candidate
  only det   → investigate (unusual pattern)

Usage:
  python3 scripts/find_candidates.py              # |raw_r|>0.99, n>=20
  python3 scripts/find_candidates.py 0.95 10      # custom thresholds
"""
import json
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations

BASE = "https://sector-slow.fourieranalys.workers.dev"
DAY_MS = 86400000


def fetch_history(sector):
    """Fetch /history/<sector>; return (sector, points) or (sector, None)."""
    try:
        url = f"{BASE}/history/{sector}"
        with urllib.request.urlopen(url, timeout=20) as r:
            data = json.loads(r.read())
        pts = data.get("history") or []
        pts = [p for p in pts if isinstance(p.get("v"), (int, float))]
        return sector, pts if pts else None
    except Exception:
        return sector, None


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    den = math.sqrt(vx * vy)
    if den == 0:
        return None
    return cov / den


def detrend(pts):
    """Linear detrend, matching workers/sector-slow/src/arbitration.js."""
    if len(pts) < 3:
        return None
    t0 = pts[0][0]
    ts = [(t - t0) / DAY_MS for t, _ in pts]
    vs = [v for _, v in pts]
    n = len(ts)
    st = sum(ts)
    sv = sum(vs)
    stv = sum(t * v for t, v in zip(ts, vs))
    st2 = sum(t * t for t in ts)
    den = n * st2 - st * st
    if den == 0:
        return None
    slope = (n * stv - st * sv) / den
    intercept = (sv - slope * st) / n
    return [v - (intercept + slope * t) for t, v in zip(ts, vs)]


def align(a_pts, b_pts):
    """Align two histories by UTC day, matching the worker's logic."""
    a_map = {t // DAY_MS: v for t, v in a_pts}
    b_map = {t // DAY_MS: v for t, v in b_pts}
    common = sorted(set(a_map) & set(b_map))
    if not common:
        return None
    a_vals = [a_map[d] for d in common]
    b_vals = [b_map[d] for d in common]
    # Also align residuals: filter to common days first, then detrend
    a_common_pts = sorted((d * DAY_MS, a_map[d]) for d in common)
    b_common_pts = sorted((d * DAY_MS, b_map[d]) for d in common)
    a_res = detrend(a_common_pts)
    b_res = detrend(b_common_pts)
    return {
        "n": len(common),
        "a_vals": a_vals,
        "b_vals": b_vals,
        "a_res": a_res,
        "b_res": b_res,
    }


def known_provenance():
    """Fetch pairs the worker already confirms as provenance."""
    try:
        with urllib.request.urlopen(f"{BASE}/_correlation", timeout=20) as r:
            data = json.loads(r.read())
        pairs = data.get("pairs") or []
        return {tuple(sorted([p["a"], p["b"]])) for p in pairs if p.get("provenance")}
    except Exception:
        return set()


def main():
    threshold = float(sys.argv[1]) if len(sys.argv) > 1 else 0.99
    min_days = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    sectors = json.load(open("config/active_sectors.json"))
    print(f"Fetching /history for {len(sectors)} sectors (parallel 20)...")

    histories = {}
    with ThreadPoolExecutor(max_workers=20) as ex:
        for sector, pts in ex.map(fetch_history, sectors):
            if pts and len(pts) >= min_days:
                histories[sector] = pts

    print(f"  {len(histories)} sectors with >={min_days} points")
    if len(histories) < 2:
        print("  Too few sectors — nothing to compare")
        return

    known = known_provenance()
    print(f"  {len(known)} known provenance pair(s) — will exclude")

    print(f"\nComputing pairwise correlations ({len(histories)*(len(histories)-1)//2} pairs)...")
    candidates = []
    for a_name, b_name in combinations(histories.keys(), 2):
        aligned = align(histories[a_name], histories[b_name])
        if not aligned or aligned["n"] < min_days:
            continue
        raw_r = pearson(aligned["a_vals"], aligned["b_vals"])
        if raw_r is None or abs(raw_r) < threshold:
            continue
        det_r = None
        if aligned["a_res"] and aligned["b_res"]:
            det_r = pearson(aligned["a_res"], aligned["b_res"])
        key = tuple(sorted([a_name, b_name]))
        candidates.append({
            "a": a_name,
            "b": b_name,
            "raw_r": round(raw_r, 4),
            "det_r": round(det_r, 4) if det_r is not None else None,
            "n": aligned["n"],
            "known": key in known,
        })

    candidates.sort(key=lambda c: -abs(c["raw_r"]))
    new_candidates = [c for c in candidates if not c["known"]]

    print(f"\n{len(candidates)} pair(s) with |raw_r| > {threshold}")
    print(f"{len(new_candidates)} NOT already known provenance")

    print(f"\n{'sector_a':<38} {'sector_b':<38} {'raw_r':>8} {'det_r':>8} {'n':>4}")
    print("-" * 100)
    for c in new_candidates[:60]:
        det = f"{c['det_r']:+.3f}" if c['det_r'] is not None else "   —  "
        print(f"{c['a']:<38} {c['b']:<38} {c['raw_r']:>+8.3f} {det:>8} {c['n']:>4}")

    if len(new_candidates) > 60:
        print(f"\n... {len(new_candidates) - 60} more candidates (truncated)")

    print(f"\nReview each: if it measures the same quantity (unlikely), add to")
    print(f"PROVENANCE_PAIRS in workers/sector-slow/src/index.js. If det_r is low")
    print(f"but raw_r is high, it's a shared trend (e.g. both trending up during 2020)")


if __name__ == "__main__":
    main()
