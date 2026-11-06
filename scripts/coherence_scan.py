#!/usr/bin/env python3
"""Rank sectors by detrended coherence (z-score of current vs. history).

Reads /history/<sector>, computes detrendedCoherence locally using the
same math as workers/sector-slow/src/arbitration.js, and ranks sectors
by |z| to answer:

    "Which sectors are currently most anomalous vs. their own history?"

This is the cross-sector view the dashboard doesn't have. Use it to
find sectors worth looking at before correlations even enter the picture.

Usage:
  python3 scripts/coherence_scan.py              # all sectors, n>=10
  python3 scripts/coherence_scan.py --min 15     # stricter history requirement
  python3 scripts/coherence_scan.py --top 30     # show top 30 only

Read-only. Does not touch the worker or cron.
"""
import argparse
import json
import math
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://sector-slow.fourieranalys.workers.dev"
DAY_MS = 86400000


def fetch_history(sector):
    try:
        with urllib.request.urlopen(f"{BASE}/history/{sector}", timeout=20) as r:
            data = json.loads(r.read())
        pts = [p for p in (data.get("history") or [])
               if isinstance(p.get("v"), (int, float))]
        return sector, pts
    except Exception:
        return sector, None


def detrend(values):
    """Linear detrend, matching arbitration.js detrendedResiduals."""
    if len(values) < 3:
        return None
    t0 = values[0][0]
    ts = [(t - t0) / DAY_MS for t, _ in values]
    vs = [v for _, v in values]
    n = len(ts)
    st, sv = sum(ts), sum(vs)
    stv = sum(t * v for t, v in zip(ts, vs))
    st2 = sum(t * t for t in ts)
    den = n * st2 - st * st
    if den == 0:
        return None
    slope = (n * stv - st * sv) / den
    intercept = (sv - slope * st) / n
    return [v - (intercept + slope * t) for t, v in zip(ts, vs)]


def detrended_coherence(values):
    """Z-score of last residual against residual distribution."""
    if len(values) < 5:
        return None
    residuals = detrend(values)
    if residuals is None or len(residuals) < 4:
        return None
    current = residuals[-1]
    prior = residuals[:-1]
    if len(prior) < 3:
        return None
    mean = statistics.mean(prior)
    try:
        stdev = statistics.stdev(prior)
    except statistics.StatisticsError:
        return None
    if stdev == 0 or not math.isfinite(stdev):
        return None
    z = (current - mean) / stdev
    return z


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=int, default=10,
                    help="minimum history points (default 10)")
    ap.add_argument("--top", type=int, default=25,
                    help="show top N (default 25)")
    args = ap.parse_args()

    sectors = json.load(open("config/active_sectors.json"))
    print(f"Fetching /history for {len(sectors)} sectors (parallel 20)...")

    results = []
    with ThreadPoolExecutor(max_workers=20) as ex:
        for sector, pts in ex.map(fetch_history, sectors):
            if not pts or len(pts) < args.min:
                continue
            z = detrended_coherence(pts)
            if z is None:
                continue
            results.append({
                "sector": sector,
                "n": len(pts),
                "z": round(z, 3),
                "abs_z": abs(z),
                "last_value": pts[-1][1],
            })

    results.sort(key=lambda r: -r["abs_z"])

    if not results:
        print(f"\n  0 sectors with >={args.min} points and valid z-score")
        print(f"  Need more history. Cron writes one point per day, one shard")
        print(f"  per sector. After 3 weeks, most sectors will pass this filter.")
        return

    print(f"\n  {len(results)} sectors ranked\n")
    print(f"{'sector':<40} {'n':>4} {'z':>8} {'|z|':>8} {'last_value':>14}")
    print("-" * 78)
    for r in results[:args.top]:
        bar = "!" if r["abs_z"] > 2.5 else " "
        print(f"{r['sector']:<40} {r['n']:>4} {r['z']:>+8.2f} {r['abs_z']:>8.2f} {r['last_value']:>14.4g} {bar}")

    print(f"\n  '!' marks |z| > 2.5 — sectors whose current observation is")
    print(f"  unusually far from their linear trend (2.5σ). These are")
    print(f"  candidate anomalies. Coherence is per-sector; not related to")
    print(f"  cross-sector correlation. Both matter, differently.")


if __name__ == "__main__":
    main()
