#!/usr/bin/env python3
"""Threshold audit: compare configured thresholds to observed volatility.

Reads:
  data/digest_history.json  — observed pct_change per sector per run
  workers/sector-dense/src/index.js  — configured threshold_pct per sector

Outputs:
  A table showing fire rate, avg move, max move, current threshold, and verdict.
  Optional: --apply to auto-tune clearly miscalibrated thresholds.
"""
import argparse
import json
import re
import statistics
from pathlib import Path


def load_history(path="data/digest_history.json"):
    with open(path) as f:
        return json.load(f)


def load_thresholds(worker_path="workers/sector-dense/src/index.js"):
    """Extract sector config by scanning lines. Robust against formatting."""
    text = Path(worker_path).read_text()
    lines = text.split("\n")
    result = {}
    current_sector = None
    for line in lines:
        # Sector declaration: "name": {  or  name: {  (with optional trailing whitespace)
        m = re.match(r'^\s*["\']?([a-z0-9-]+)["\']?\s*:\s*\{\s*$', line)
        if m:
            current_sector = m.group(1)
            continue
        # Config line with threshold_pct and threshold_abs (single line)
        if current_sector and 'config:' in line and 'threshold_pct' in line:
            mp = re.search(r'threshold_pct:\s*([0-9.]+)', line)
            ma = re.search(r'threshold_abs:\s*([0-9.eE+-]+)', line)
            mm = re.search(r'metric:\s*"([^"]+)"', line)
            if mp and ma:
                try:
                    result[current_sector] = {
                        "metric": mm.group(1) if mm else None,
                        "threshold_pct": float(mp.group(1)),
                        "threshold_abs": float(ma.group(1)),
                    }
                except ValueError:
                    pass
    return result


def analyze(history, thresholds):
    """For each sector, compute fire rate + observed pct stats."""
    runs = history.get("runs", [])
    window = runs[-24:] if len(runs) > 24 else runs
    if not window:
        return []

    stats = {}
    for run in window:
        for name, data in (run.get("sectors") or {}).items():
            s = stats.setdefault(name, {"fires": 0, "pcts": [], "total": 0})
            s["total"] += 1
            if data.get("has_signal"):
                s["fires"] += 1
            pct = data.get("pct_change")
            if isinstance(pct, (int, float)):
                s["pcts"].append(abs(pct))

    rows = []
    for name, s in stats.items():
        cfg = thresholds.get(name)
        if not cfg:
            continue
        pcts = s["pcts"]
        avg = statistics.mean(pcts) if pcts else 0
        mx = max(pcts) if pcts else 0
        thresh = cfg["threshold_pct"]

        # Verdict logic:
        #   fire rate < 5%  AND avg < thresh/2  → TOO TIGHT (threshold too high)
        #   fire rate > 50% AND avg < thresh*0.8 → TOO LOOSE (threshold too low — fires on noise)
        #   else → OK
        fire_rate = s["fires"] / s["total"] if s["total"] else 0
        if fire_rate < 0.05 and avg > 0 and avg < thresh * 0.5:
            verdict = "TOO TIGHT"
            suggested = round(avg * 1.5, 2)
        elif fire_rate > 0.5 and avg > 0 and avg < thresh * 0.8:
            verdict = "TOO LOOSE"
            suggested = round(avg * 2, 2)
        else:
            verdict = "OK"
            suggested = None

        rows.append({
            "sector": name,
            "fires": s["fires"],
            "total": s["total"],
            "fire_rate": round(fire_rate * 100, 1),
            "avg_abs_pct": round(avg, 3),
            "max_abs_pct": round(mx, 3),
            "threshold_pct": thresh,
            "metric": cfg["metric"],
            "verdict": verdict,
            "suggested_pct": suggested,
        })

    # Sort: TOO TIGHT first (biggest opportunity), then TOO LOOSE, then OK
    order = {"TOO TIGHT": 0, "TOO LOOSE": 1, "OK": 2}
    rows.sort(key=lambda r: (order[r["verdict"]], -r["avg_abs_pct"]))
    return rows


def print_table(rows):
    print(f"{'sector':<28} {'fires':>7} {'avg%':>8} {'max%':>8} {'thresh':>8}  {'verdict':<12} {'→ suggested'}")
    print("-" * 100)
    for r in rows:
        sug = f"{r['suggested_pct']}%" if r['suggested_pct'] is not None else ""
        print(
            f"{r['sector']:<28} {r['fires']:>3}/{r['total']:<3} "
            f"{r['avg_abs_pct']:>8} {r['max_abs_pct']:>8} "
            f"{r['threshold_pct']:>7}%  {r['verdict']:<12} {sug}"
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Auto-apply suggested thresholds to worker source")
    parser.add_argument("--min-runs", type=int, default=4,
                        help="Skip sectors with fewer than N historical runs (default: 4)")
    parser.add_argument("--json", action="store_true",
                        help="Output as JSON instead of table")
    args = parser.parse_args()

    history = load_history()
    thresholds = load_thresholds()
    rows = analyze(history, thresholds)

    # Filter out sectors with too few runs
    rows = [r for r in rows if r["total"] >= args.min_runs]

    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print_table(rows)
        tight = sum(1 for r in rows if r["verdict"] == "TOO TIGHT")
        loose = sum(1 for r in rows if r["verdict"] == "TOO LOOSE")
        ok = sum(1 for r in rows if r["verdict"] == "OK")
        print(f"\n{tight} TOO TIGHT, {loose} TOO LOOSE, {ok} OK (of {len(rows)} sectors)")

    if args.apply:
        # Apply suggestions
        worker = Path("workers/sector-dense/src/index.js")
        text = worker.read_text()
        applied = 0
        for r in rows:
            if r["suggested_pct"] is None:
                continue
            # Only replace within this sector's block
            pattern = re.compile(
                rf'(["\']?{re.escape(r["sector"])}["\']?\s*:\s*\{{.*?threshold_pct:\s*)'
                rf'{re.escape(str(r["threshold_pct"]))}',
                re.DOTALL
            )
            new_text, n = pattern.subn(
                rf'\g<1>{r["suggested_pct"]}', text, count=1
            )
            if n > 0:
                text = new_text
                applied += 1
        if applied:
            worker.write_text(text)
            print(f"\nApplied {applied} threshold changes to worker")
            print("Verify with: node --check workers/sector-dense/src/index.js")
            print("Then deploy: cd workers/sector-dense && wrangler deploy")
        else:
            print("\nNo changes applied")


if __name__ == "__main__":
    main()
