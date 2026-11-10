#!/usr/bin/env python3
"""Accuracy tracker: did past signals predict what actually happened?

For 3 sectors with checkable outcomes:
  - kraken-btc-usd           (Kraken OHLC API)
  - nvd-new-cves-count       (NVD REST API, rate-limited)
  - usgs-significant-quakes  (USGS FDSN, no auth)

For each sector, for each snapshot where enough time has passed:
  1. Signal at date T claims direction: current > previous → "up"
  2. Actual outcome: was value at T+N still above value at T?
  3. hit = predicted == actual

Reported per sector:
  - hit_rate: fraction of signals where prediction matched outcome
  - baseline: base rate of the majority class (honest floor)
  - skill:    hit_rate - baseline (only positive skill means value)
  - sample_size, actual_up_count, actual_down_count

Output: docs/accuracy.json
"""
import json, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_DIR = ROOT / "docs" / "snapshots"
OUTPUT = ROOT / "docs" / "accuracy.json"

UA = "VolatiAI-AccuracyTracker/1.0 (+https://christianscode1994.github.io/VolatiAI)"


def fetch_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def kraken_btc_series(start_date, end_date):
    """Return {YYYY-MM-DD: close_price} from Kraken daily OHLC."""
    since_ts = int(datetime.combine(start_date, datetime.min.time()).timestamp())
    url = f"https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since={since_ts}"
    try:
        data = fetch_json(url)
    except Exception as e:
        print(f"  kraken fetch failed: {e}", file=sys.stderr)
        return {}
    result = data.get("result") or {}
    rows = next((v for k, v in result.items() if k != "last"), [])
    series = {}
    for row in rows:
        ts = int(row[0])
        date = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        if start_date <= date <= end_date:
            series[date.isoformat()] = float(row[4])  # close
    return series


def nvd_cve_series(start_date, end_date):
    """Return {YYYY-MM-DD: cve_count} from NVD. Bulk query + bucket locally."""
    url = (f"https://services.nvd.nist.gov/rest/json/cves/2.0"
           f"?pubStartDate={start_date.isoformat()}T00:00:00.000"
           f"&pubEndDate={end_date.isoformat()}T23:59:59.999")
    try:
        first = fetch_json(url)
    except Exception as e:
        print(f"  nvd first fetch failed: {e}", file=sys.stderr)
        return {}
    total = first.get("totalResults", 0)
    print(f"  nvd: {total} CVEs in range")
    vulns = list(first.get("vulnerabilities", []))
    page = 2000
    while len(vulns) < total:
        time.sleep(6)  # NVD rate limit without API key
        offset = len(vulns)
        try:
            data = fetch_json(url + f"&resultsPerPage={page}&startIndex={offset}")
        except Exception as e:
            print(f"  nvd page {offset} failed: {e}", file=sys.stderr)
            break
        new = data.get("vulnerabilities", [])
        if not new:
            break
        vulns.extend(new)
    series = {}
    for v in vulns:
        pub = v.get("cve", {}).get("published", "")
        if len(pub) >= 10:
            date = pub[:10]
            series[date] = series.get(date, 0) + 1
    return series


def usgs_quake_series(start_date, end_date):
    """Return {YYYY-MM-DD: count} for M4.5+ quakes."""
    url = (f"https://earthquake.usgs.gov/fdsnws/event/1/query"
           f"?format=geojson&starttime={start_date.isoformat()}"
           f"&endtime={end_date.isoformat()}&minmagnitude=4.5")
    try:
        data = fetch_json(url)
    except Exception as e:
        print(f"  usgs fetch failed: {e}", file=sys.stderr)
        return {}
    series = {}
    for f in data.get("features", []):
        ts = f["properties"]["time"] / 1000
        date = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        series[date] = series.get(date, 0) + 1
    return series


def track_sector(sector, series, snapshots):
    """For each snapshot with a signal, compare predicted vs actual direction."""
    hits = 0
    ups = 0
    total = 0
    detail = []
    for snap in snapshots:
        sd = snap["data"].get("sectors", {}).get(sector)
        if not sd:
            continue
        delta = sd.get("delta") or {}
        cur = delta.get("current")
        prev = delta.get("previous")
        win = delta.get("actual_window_days")
        if cur is None or prev is None or win is None:
            continue
        win_n = max(1, int(round(float(win))))
        predicted_up = cur > prev
        target_date = (datetime.fromisoformat(snap["date"]) + timedelta(days=win_n)).date().isoformat()
        if target_date not in series:
            continue
        actual_up = series[target_date] > cur
        if actual_up == predicted_up:
            hits += 1
        if actual_up:
            ups += 1
        total += 1
        detail.append({"date": snap["date"], "hit": actual_up == predicted_up, "pred_up": predicted_up, "act_up": actual_up})
    if total == 0:
        return None
    hit_rate = hits / total
    baseline = max(ups, total - ups) / total
    return {
        "sector": sector,
        "hit_rate": round(hit_rate, 4),
        "baseline": round(baseline, 4),
        "skill": round(hit_rate - baseline, 4),
        "sample_size": total,
        "actual_up_count": ups,
        "actual_down_count": total - ups,
        "detail": detail,
    }


def main():
    snapshots = []
    for p in sorted(SNAPSHOT_DIR.glob("*.json")):
        if p.name.startswith("_"):
            continue
        try:
            data = json.loads(p.read_text())
            snapshots.append({"date": p.stem, "data": data})
        except Exception:
            continue
    if not snapshots:
        print("❌ no snapshots found"); sys.exit(1)
    oldest = datetime.fromisoformat(snapshots[0]["date"]).date()
    newest = datetime.fromisoformat(snapshots[-1]["date"]).date()
    start = oldest - timedelta(days=20)
    end = newest + timedelta(days=30)
    print(f"Date range: {start} to {end}  ({len(snapshots)} snapshots)")

    results = {}
    for sector, fetcher in [
        ("kraken-btc-usd", kraken_btc_series),
        ("usgs-significant-quakes", usgs_quake_series),
        ("nvd-new-cves-count", nvd_cve_series),
    ]:
        print(f"\n→ {sector}")
        series = fetcher(start, end)
        if not series:
            print("  no outcome data — skipping")
            continue
        print(f"  series: {len(series)} dates")
        r = track_sector(sector, series, snapshots)
        if r:
            results[sector] = r
            print(f"  hit_rate={r['hit_rate']:.3f}  baseline={r['baseline']:.3f}  "
                  f"skill={r['skill']:+.3f}  n={r['sample_size']}")
        else:
            print("  no mature samples yet (need snapshots whose window has passed)")

    OUTPUT.write_text(json.dumps(results, indent=2) + "\n")
    print(f"\n✅ wrote {OUTPUT}")


if __name__ == "__main__":
    main()
