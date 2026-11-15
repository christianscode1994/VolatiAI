#!/usr/bin/env python3
"""
scripts/build_track_record.py

Backtest every history/volatility/*.json.gz snapshot:
  At time T, take top-3 by volatility and top-3 by rank-v1 (risk_adjusted).
  Look up the same assets' current_price at the next snapshot at T+24h (and T+7d).
  Aggregate mean, median, hit rate, edge over benchmark.

Outputs docs/track_record.json.
"""

import gzip
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean, median


def load_snapshot(path):
    with gzip.open(str(path), "rt", encoding="utf-8") as f:
        return json.load(f)


def parse_ts(name):
    base = os.path.basename(name).replace(".json.gz", "")
    if "T" not in base:
        return None
    date_part, time_part = base.split("T")
    hh, mm = time_part.split("-")
    try:
        return datetime.fromisoformat(f"{date_part}T{hh}:{mm}:00+00:00")
    except ValueError:
        return None


def nearest_future(snaps, target_ts, min_gap_s, max_gap_s):
    best = None
    for ts, path in snaps:
        gap = (ts - target_ts).total_seconds()
        if min_gap_s <= gap <= max_gap_s:
            if best is None or ts < best[0]:
                best = (ts, path)
    return best


def rank_top_vol(assets, n=3):
    scored = []
    for a in assets:
        try:
            scored.append((float(a.get("volatility") or 0), a))
        except (ValueError, TypeError):
            continue
    scored.sort(key=lambda x: -x[0])
    return [a for _, a in scored[:n]]


def rank_risk_adjusted(assets, n=3):
    scored = []
    for a in assets:
        try:
            chg = float(a.get("price_change_7d") or 0)
            v = float(a.get("volatility") or 0.01)
            scored.append((abs(chg) / max(v, 0.01), a))
        except (ValueError, TypeError):
            continue
    scored.sort(key=lambda x: -x[0])
    return [a for _, a in scored[:n]]


def ret_pct(a0, a1):
    try:
        p0 = float(a0.get("current_price") or 0)
        p1 = float(a1.get("current_price") or 0)
        if p0 <= 0:
            return None
        return (p1 - p0) / p0 * 100.0
    except (ValueError, TypeError):
        return None


def stats(rs):
    rs = [r for r in rs if r is not None]
    if not rs:
        return {"samples": 0}
    return {
        "samples": len(rs),
        "mean_return_pct": round(mean(rs), 3),
        "median_return_pct": round(median(rs), 3),
        "hit_rate_positive": round(sum(1 for r in rs if r > 0) / len(rs), 3),
        "worst_pct": round(min(rs), 3),
        "best_pct": round(max(rs), 3),
    }


def build():
    vol_dir = Path("history/volatility")
    if not vol_dir.exists():
        return {"error": "history/volatility/ not found"}

    snaps = []
    for p in sorted(vol_dir.glob("*.json.gz")):
        ts = parse_ts(p.name)
        if ts:
            snaps.append((ts, p))

    if len(snaps) < 2:
        return {"error": "not enough snapshots", "count": len(snaps)}

    windows = {"24h": (24 * 3600, 28 * 3600), "7d": (7 * 24 * 3600, 8 * 24 * 3600)}
    results = {w: {"top_by_volatility": [], "signals_rank_risk_adjusted": [], "benchmark": []} for w in windows}

    loaded = [(ts, path, load_snapshot(path)) for ts, path in snaps]
    cache = {path: data for _, path, data in loaded}

    for ts, path, data in loaded:
        if not isinstance(data, list) or len(data) < 2:
            continue
        for wname, (target_s, maxgap_s) in windows.items():
            target_ts = ts + timedelta(seconds=target_s)
            nxt = nearest_future(snaps, target_ts, target_s - 4 * 3600, maxgap_s)
            if not nxt:
                continue
            future = cache.get(nxt[1])
            if not isinstance(future, list):
                continue
            by_sym = {a.get("symbol"): a for a in future if a.get("symbol")}

            for asset in rank_top_vol(data, n=3):
                s = asset.get("symbol")
                if s in by_sym:
                    r = ret_pct(asset, by_sym[s])
                    if r is not None:
                        results[wname]["top_by_volatility"].append(r)

            for asset in rank_risk_adjusted(data, n=3):
                s = asset.get("symbol")
                if s in by_sym:
                    r = ret_pct(asset, by_sym[s])
                    if r is not None:
                        results[wname]["signals_rank_risk_adjusted"].append(r)

            for asset in data:
                s = asset.get("symbol")
                if s in by_sym:
                    r = ret_pct(asset, by_sym[s])
                    if r is not None:
                        results[wname]["benchmark"].append(r)

    out = {
        "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "snapshots_total": len(snaps),
        "snapshots_from": snaps[0][0].isoformat() if snaps else None,
        "snapshots_to": snaps[-1][0].isoformat() if snaps else None,
        "windows": {},
        "methodology": (
            "At each snapshot time T, rank the tracked universe two ways "
            "(raw volatility; rank-v1 risk_adjusted = abs(price_change_7d)/max(volatility,0.01)). "
            "Take top 3. Look up current_price at next snapshot T+window. Simple % return. "
            "Aggregate across snapshots. Benchmark = equal-weight all assets present in both."
        ),
        "note": "Simple % price change. Slippage, fees, funding NOT modeled. Small sample.",
        "disclaimer": "Past performance does not predict future results.",
    }

    for wname in windows:
        out["windows"][wname] = {
            "top_by_volatility": stats(results[wname]["top_by_volatility"]),
            "signals_rank_risk_adjusted": stats(results[wname]["signals_rank_risk_adjusted"]),
            "benchmark": stats(results[wname]["benchmark"]),
        }
        tbv = out["windows"][wname]["top_by_volatility"]
        sr = out["windows"][wname]["signals_rank_risk_adjusted"]
        bm = out["windows"][wname]["benchmark"]
        if tbv.get("samples") and bm.get("samples"):
            out["windows"][wname]["edge_top_vol_over_benchmark_pct"] = round(tbv["mean_return_pct"] - bm["mean_return_pct"], 3)
        if sr.get("samples") and bm.get("samples"):
            out["windows"][wname]["edge_rank_v1_over_benchmark_pct"] = round(sr["mean_return_pct"] - bm["mean_return_pct"], 3)

    Path("docs").mkdir(exist_ok=True)
    Path("docs/track_record.json").write_text(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    result = build()
    brief = {k: result.get(k) for k in ("as_of", "snapshots_total", "windows", "error")}
    print(json.dumps(brief, indent=2))
