#!/usr/bin/env python3
"""Backfill historical values from source APIs into sector KV.

Only backfills days BEFORE today. Today's existing entry wins (worker-
computed value stays authoritative). Meant to be run once; safe to re-run.

Sources with historical data available:
  treasuries  -> FRED DGS10 daily CSV
  environment -> NOAA CO2 Mauna Loa daily CSV

Not backfillable today: gdp, unemployment (annual), crossref, doaj,
datacite, wikidata, openfda, met, cleveland, ballotwatch, cern,
apis-guru, usgs-earthquakes (would require per-day count queries).

Usage:
  python3 scripts/backfill.py              # all available
  python3 scripts/backfill.py treasuries   # only one
"""

import csv, io, json, ssl, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

KV_BINDING = "SECTOR_KV"
WORKER_CWD = "workers/sector-slow"

SECTORS = {
    "treasuries":  {"kv_key": "treasuries_yield_10y_history", "fetcher": "fred_dgs10",    "days": 90},
    "environment": {"kv_key": "environment_co2_ppm_history",  "fetcher": "noaa_co2_daily", "days": 90},
    "usgs-earthquakes": {"kv_key": "usgs-earthquakes_earthquakes_since_2026_history", "fetcher": "usgs_cumulative", "days": 90},
    "crossref-works":   {"kv_key": "crossref-works_total_works_history",                    "fetcher": "crossref_cumulative", "days": 90},
    "openfda-drug-recalls": {"kv_key": "openfda-drug-recalls_drug_recalls_history",           "fetcher": "openfda_cumulative", "days": 90},
    "openfda-food-recalls": {"kv_key": "openfda-food-recalls_food_recalls_history",           "fetcher": "openfda_food_cumulative", "days": 90},
    "openfda-device-recalls": {"kv_key": "openfda-device-recalls_device_recalls_history",     "fetcher": "openfda_device_cumulative", "days": 90},
    "datacite-dois":        {"kv_key": "datacite-dois_total_dois_history",                    "fetcher": "datacite_cumulative", "days": 90},
    # "doaj-articles": NOT BACKFILLABLE — DOAJ created_date filter does not filter historically
    # "doaj-articles": {"kv_key": "doaj-articles_total_articles_history", "fetcher": "doaj_cumulative", "days": 90},
    "treasuries-gov":       {"kv_key": "treasuries-gov_yield_10y_history",                    "fetcher": "treasuries_gov",      "days": 90},
    "usgs-earthquakes-emsc": {"kv_key": "usgs-earthquakes-emsc_earthquakes_since_2026_history", "fetcher": "emsc_cumulative",     "days": 90},
}

def fetch_fred_dgs10(days):
    start = datetime.now(timezone.utc) - timedelta(days=days)
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd={start.strftime('%Y-%m-%d')}"
    req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0 (contact@volatiai.local)"})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        csv_text = r.read().decode()
    out = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        d = row.get("observation_date") or row.get("DATE") or ""
        v = row.get("DGS10") or row.get("VALUE") or ""
        if not d or v in ("", "."):
            continue
        try:
            dt = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            out.append({"t": int(dt.timestamp() * 1000), "v": float(v)})
        except ValueError:
            continue
    return out

def fetch_noaa_co2_daily(days):
    url = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv"
    req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        text = r.read().decode()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for line in text.split("\n"):
        if not line or line.startswith("#"):
            continue
        parts = line.split(",")
        if len(parts) < 5:
            continue
        try:
            y, m, d, v = int(parts[0]), int(parts[1]), int(parts[2]), float(parts[4])
            dt = datetime(y, m, d, tzinfo=timezone.utc)
        except (ValueError, IndexError):
            continue
        if dt < cutoff:
            continue
        out.append({"t": int(dt.timestamp() * 1000), "v": v})
    return out

def fetch_usgs_cumulative(days):
    """Cumulative earthquake count since 2026-01-01, one query per day.
    Each day's value is the running total, which matches what the worker's
    live collector would have computed that day. ~90 queries, ~30 seconds."""
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    out = []
    cursor = max(start, cutoff) + timedelta(days=1)
    while cursor <= today:
        start_str = start.strftime("%Y-%m-%d")
        end_str = (cursor + timedelta(days=1)).strftime("%Y-%m-%d")
        url = (
            "https://earthquake.usgs.gov/fdsnws/event/1/count"
            f"?format=geojson&starttime={start_str}&endtime={end_str}"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
                j = json.loads(r.read().decode())
                if isinstance(j.get("count"), int):
                    out.append({"t": int(cursor.timestamp() * 1000), "v": j["count"]})
        except Exception as e:
            print(f"  WARN {cursor.date()}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
    return out

def fetch_crossref_cumulative(days):
    """Crossref cumulative work count via date-filtered queries.
    Each query returns total works registered up to and including that date.
    ~90 queries, ~30-45 seconds (with polite 0.1s delay between requests)."""
    import time
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    out = []
    cursor = cutoff + timedelta(days=1)
    while cursor <= today:
        date_str = cursor.strftime("%Y-%m-%d")
        url = f"https://api.crossref.org/works?filter=until-created-date:{date_str}&rows=0"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "VolatiAI/1.0 (mailto:contact@volatiai.local)"},
            )
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                j = json.loads(r.read().decode())
                total = j.get("message", {}).get("total-results")
                if isinstance(total, int):
                    out.append({"t": int(cursor.timestamp() * 1000), "v": total})
        except Exception as e:
            print(f"  WARN {date_str}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
        time.sleep(0.1)
    return out

def _fetch_openfda_cumulative(days, endpoint):
    """Generic openFDA enforcement cumulative-by-report_date fetcher.
    endpoint is 'drug', 'food', or 'device'. All three share the same
    response schema (meta.results.total) and rate limiter."""
    import time
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    out = []
    cursor = cutoff + timedelta(days=1)
    while cursor <= today:
        date_str = cursor.strftime("%Y%m%d")
        url = f"https://api.fda.gov/{endpoint}/enforcement.json?search=report_date:[20040101+TO+{date_str}]&limit=1"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                j = json.loads(r.read().decode())
                total = j.get("meta", {}).get("results", {}).get("total")
                if isinstance(total, int):
                    out.append({"t": int(cursor.timestamp() * 1000), "v": total})
        except Exception as e:
            print(f"  WARN {date_str}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
        time.sleep(0.1)
    return out

def fetch_openfda_cumulative(days):
    return _fetch_openfda_cumulative(days, "drug")

def fetch_openfda_food_cumulative(days):
    return _fetch_openfda_cumulative(days, "food")

def fetch_openfda_device_cumulative(days):
    return _fetch_openfda_cumulative(days, "device")


def fetch_datacite_cumulative(days):
    """DataCite DOIs registered, cumulative by created date."""
    import time
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    out = []
    cursor = cutoff + timedelta(days=1)
    while cursor <= today:
        date_str = cursor.strftime("%Y-%m-%d")
        # DataCite supports query=created:[* TO date]
        url = f"https://api.datacite.org/dois?query=created:%5B*%20TO%20{date_str}%5D&page[size]=1"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                j = json.loads(r.read().decode())
                total = j.get("meta", {}).get("total")
                if isinstance(total, int):
                    out.append({"t": int(cursor.timestamp() * 1000), "v": total})
        except Exception as e:
            print(f"  WARN {date_str}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
        time.sleep(0.1)
    return out


def fetch_doaj_cumulative(days):
    """DOAJ articles, cumulative by created_date.
    DOAJ requires per-date query with sort=created_date:asc."""
    import time
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    out = []
    cursor = cutoff + timedelta(days=1)
    while cursor <= today:
        date_str = cursor.strftime("%Y-%m-%d")
        url = f"https://doaj.org/api/search/articles/*?pageSize=1&query=created_date:%5B*%20TO%20{date_str}T23:59:59Z%5D"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0", "accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                j = json.loads(r.read().decode())
                total = j.get("total")
                if isinstance(total, int):
                    out.append({"t": int(cursor.timestamp() * 1000), "v": total})
        except Exception as e:
            print(f"  WARN {date_str}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
        time.sleep(0.1)
    return out

def fetch_treasuries_gov(days):
    """Treasury.gov daily yield curve CSV. Returns {t,v} for each weekday
    with a 10-Yr value in the last `days` days. Single CSV fetch."""
    import csv as csvmod, io, time
    year = datetime.now(timezone.utc).year
    url = f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"
    req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        text = r.read().decode()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    reader = csvmod.DictReader(io.StringIO(text))
    for row in reader:
        d = row.get("Date", "").strip()
        v = row.get("10 Yr", "").strip()
        if not d or not v or v.upper() == "N/A":
            continue
        try:
            dt = datetime.strptime(d, "%m/%d/%Y").replace(tzinfo=timezone.utc)
            val = float(v)
        except ValueError:
            continue
        if dt < cutoff:
            continue
        out.append({"t": int(dt.timestamp() * 1000), "v": val})
    return sorted(out, key=lambda x: x["t"])

def fetch_emsc_cumulative(days):
    """EMSC FDSN cumulative earthquake count. Per-day queries with
    endtime=D and starttime=2026-01-01 fixed."""
    import time
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=days)
    start = "2026-01-01"
    out = []
    cursor = cutoff + timedelta(days=1)
    while cursor <= today:
        end = cursor.strftime("%Y-%m-%d")
        url = f"https://www.seismicportal.eu/fdsnws/event/1/count?starttime={start}&endtime={end}&format=text"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI/1.0"})
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                text = r.read().decode().strip()
                n = int(text)
                if n > 0:
                    out.append({"t": int(cursor.timestamp() * 1000), "v": n})
        except Exception as e:
            print(f"  WARN {end}: {e}", file=sys.stderr)
        cursor += timedelta(days=1)
        time.sleep(0.1)
    return sorted(out, key=lambda x: x["t"])

FETCHERS = {
    "openfda_food_cumulative":   fetch_openfda_food_cumulative,
    "openfda_device_cumulative": fetch_openfda_device_cumulative,
    "fred_dgs10":          fetch_fred_dgs10,
    "noaa_co2_daily":      fetch_noaa_co2_daily,
    "usgs_cumulative":     fetch_usgs_cumulative,
    "crossref_cumulative": fetch_crossref_cumulative,
    "openfda_cumulative":  fetch_openfda_cumulative,
    "datacite_cumulative": fetch_datacite_cumulative,
    "doaj_cumulative":     fetch_doaj_cumulative,
    "treasuries_gov":      fetch_treasuries_gov,
    "emsc_cumulative":     fetch_emsc_cumulative,
}



def get_current(kv_key):
    r = subprocess.run(
        ["npx", "wrangler", "kv", "key", "get", "--binding", KV_BINDING, "--remote", kv_key],
        cwd=WORKER_CWD, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return []
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return []

def put(kv_key, entries):
    with open("/tmp/volatiai_history.json", "w") as f:
        json.dump(entries, f)
    r = subprocess.run(
        ["npx", "wrangler", "kv", "key", "put", "--binding", KV_BINDING, "--remote",
         "--path", "/tmp/volatiai_history.json", kv_key],
        cwd=WORKER_CWD, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        print(f"  ERROR: {r.stderr.strip()[:200]}", file=sys.stderr)
        return False
    return True

def merge_by_day(history, backfill):
    today = datetime.now(timezone.utc).date()
    def day_of(e): return datetime.fromtimestamp(e["t"]/1000, tz=timezone.utc).date()
    merged = {}
    for e in backfill:
        d = day_of(e)
        if d == today:
            continue
        merged[d.isoformat()] = e
    for e in history:
        merged[day_of(e).isoformat()] = e   # current history wins per day
    return sorted(merged.values(), key=lambda x: x["t"])

def main():
    targets = sys.argv[1:] or list(SECTORS.keys())
    for sector in targets:
        if sector not in SECTORS:
            print(f"skip {sector}: unknown"); continue
        cfg = SECTORS[sector]
        print(f"=== {sector} ===")
        print(f"  fetching {cfg['days']}d from {cfg['fetcher']}...")
        try:
            backfill = FETCHERS[cfg["fetcher"]](cfg["days"])
        except Exception as e:
            print(f"  FETCH ERROR: {e}", file=sys.stderr); continue
        print(f"  {len(backfill)} entries fetched")
        if not backfill:
            continue
        print(f"  reading current KV...")
        history = get_current(cfg["kv_key"])
        print(f"  {len(history)} current entries")
        merged = merge_by_day(history, backfill)
        print(f"  {len(merged)} after merge")
        first = datetime.fromtimestamp(merged[0]["t"]/1000, tz=timezone.utc).date()
        last = datetime.fromtimestamp(merged[-1]["t"]/1000, tz=timezone.utc).date()
        print(f"  range: {first} -> {last}")
        print(f"  writing...")
        print(f"  ✓" if put(cfg["kv_key"], merged) else f"  ✗")

if __name__ == "__main__":
    main()
