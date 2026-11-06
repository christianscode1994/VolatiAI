#!/usr/bin/env python3
"""
Non-blocking sanity checks on sector definitions.
Never blocks a commit — always exit 0.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKERS = ["sparse", "dense", "slow"]

# Keyword -> list of acceptable hosts (substring match)
SECTOR_HOST_HINTS = {
    "e-commerce":  ["shopify", "amazon", "stripe", "etsy", "ebay", "shopify"],
    "bank-data":   ["worldbank", "bis.org", "imf.org"],
    "alcohol":     ["who.int", "cdc.gov", "gho", "nhanes", "niaaa"],
    "tobacco":     ["who.int", "cdc.gov", "gho", "nhanes"],
    "mental":      ["who.int", "cdc.gov", "gho", "nih.gov", "nimh"],
    "space":       ["nasa.gov", "spacex", "thespacedevs", "celestrak", "spaceflightnews", "pocketworld"],
    "crypto":      ["binance", "gemini", "blockchain", "coingecko", "coinbase", "llama.fi", "defillama"],
    "defi":        ["llama.fi", "defillama", "uniswap", "aave", "cantex", "orca"],
    "quake":       ["usgs.gov", "earthquake", "seismicportal", "geonet.org", "emsc"],
    "earthquake":  ["usgs.gov", "earthquake", "seismicportal", "geonet.org", "emsc"],
    "weather":     ["open-meteo", "noaa", "openweathermap", "swpc", "pocketworld"],
    "spaceweather":["swpc", "noaa", "pocketworld", "elering"],
    "status":      ["statuspage.io", "status.cloud", "githubstatus", "cloudflarestatus",
                    "digitalocean", "atlassian", "dropbox"],
    "nbp":         ["nbp.pl", "api.nbp"],
    "gdp":         ["worldbank", "imf.org", "oecd"],
    "unemployment":["worldbank", "eurostat", "bls.gov", "oecd", "ec.europa.eu"],
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
    warnings = 0

    # Only URL mismatch check — multi-worker is by design, so skip it
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
                break  # only match first keyword

    if warnings:
        print(f"\n{warnings} warning(s) — not blocking")
    else:
        print("✓ no sanity warnings")
    return 0

if __name__ == "__main__":
    sys.exit(main())
