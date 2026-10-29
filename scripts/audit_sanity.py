#!/usr/bin/env python3
"""
Non-blocking sanity checks on sector definitions.
Never blocks a commit — always exit 0.

Checks:
  1. Uniqueness: warn if an active sector is defined in >1 worker.
  2. URL sanity: warn if a sector-name keyword doesn't match its fetch host.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKERS = ["sparse", "dense", "slow"]

SECTOR_HOST_HINTS = {
    "e-commerce": ["shopify", "amazon", "stripe", "etsy", "ebay"],
    "bank-data":  ["worldbank", "bis.org", "imf.org"],
    "alcohol":    ["who.int", "cdc.gov", "gho", "nhanes", "niaaa"],
    "tobacco":    ["who.int", "cdc.gov", "gho", "nhanes"],
    "mental":     ["who.int", "cdc.gov", "gho", "nih.gov", "nimh"],
    "space":      ["nasa.gov", "spacex", "thespacedevs", "celestrak"],
    "crypto":     ["binance", "gemini", "blockchain", "coingecko", "coinbase"],
    "quake":      ["usgs.gov", "earthquake"],
    "weather":    ["open-meteo", "noaa", "openweathermap"],
}

def worker_collectors(worker):
    path = ROOT / f"workers/sector-{worker}/src/index.js"
    if not path.exists():
        return {}
    src = path.read_text()
    m = re.search(r"^const COLLECTORS = \{\s*\n(.*?)^\};", src, re.M | re.S)
    if not m:
        return {}
    out = {}
    for bm in re.finditer(r'^  "([a-z][a-z0-9-]+)": \{\n(.*?)\n  \},', m.group(1), re.M | re.S):
        name, block = bm.group(1), bm.group(2)
        hosts = set(re.findall(r'https?://([^/"\s]+)', block))
        out[name] = hosts
    return out

def main():
    active = set(json.load(open(ROOT / "config/active_sectors.json")))
    warnings = 0

    per_sector = defaultdict(list)
    for w in WORKERS:
        for name in worker_collectors(w):
            per_sector[name].append(w)

    for name, workers in per_sector.items():
        if len(workers) > 1 and name in active:
            print(f"⚠  sector in multiple workers: {name} -> {workers}")
            warnings += 1

    for w in WORKERS:
        for name, hosts in worker_collectors(w).items():
            if not hosts:
                continue
            for keyword, expected in SECTOR_HOST_HINTS.items():
                if keyword not in name:
                    continue
                joined = " ".join(hosts).lower()
                if not any(h in joined for h in expected):
                    print(f"⚠  URL mismatch: {w}/{name} fetches {sorted(hosts)}, expected host matching {expected}")
                    warnings += 1

    if warnings:
        print(f"\n{warnings} warning(s) — not blocking")
    else:
        print("✓ no sanity warnings")
    return 0

if __name__ == "__main__":
    sys.exit(main())
