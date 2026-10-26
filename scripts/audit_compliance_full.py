"""Classify every active sector by corporate compliance risk.
Categories:
  SAFE_PD_CC0    — US government public domain or CC0 (zero risk)
  SAFE_CC_BY     — CC BY 4.0 (attribution required, freely commercial)
  SAFE_MIT       — MIT (permissive)
  SAFE_OPEN      — Open data, free-for-commercial-OK licenses
  RISKY_NC       — Non-commercial only (WHO etc.)
  RISKY_SA       — Share-alike propagation required (TVmaze etc.)
  RISKY_EXCHANGE — Crypto exchange ToS (redistribution prohibited)
  RISKY_COMMERCIAL — Commercial API with redistribution clauses
  UNKNOWN        — Not in license map, no clear source signal
  REVIEW         — "Public API" without explicit redistribution rights
  REMOVED        — Already marked as removed in map
"""
import json, re
from collections import Counter
from pathlib import Path

active = json.loads(Path("config/active_sectors.json").read_text())
licenses = json.loads(Path("config/source_licenses.json").read_text())

# Prefix-based inference for sectors not in map
PREFIX_RULES = [
    # US Federal Government (17 USC §105)
    (r'^(nws|usgs|noaa|sec|cdc|census|bts|miso|federal|bls|bea|epa|nasa|fdic|fema|cfpb|nhtsa|treasury|fed|nrel|nist)-',
     'SAFE_PD_CC0', 'Public domain (US Federal)', 'US Government'),
    # CC0
    (r'^gleif-', 'SAFE_PD_CC0', 'CC0', 'GLEIF'),
    # CC BY 4.0 — institutional open data
    (r'^(open-meteo|worldbank|eurostat|gbif|obis|bfs|prh|geonet|nhm|idigbio|crossref)-',
     'SAFE_CC_BY', 'CC BY 4.0', 'institutional'),
    # MIT
    (r'^gutendex-', 'SAFE_MIT', 'MIT', 'Gutendex'),
    # Open / permissive
    (r'^(gdacs|frankfurter|arxiv|pubmed|europepmc|datafirst|sunrise|randomuser|zippopotam|langpop)-',
     'SAFE_OPEN', 'Open data', 'see license'),
    (r'^(defillama|stablecoin|tvl-|dex-|defi-|nft-)',
     'SAFE_OPEN', 'Open (DefiLlama)', 'DefiLlama'),
    (r'^(openlibrary|openverse|wikipedia)-',
     'SAFE_OPEN', 'Open (CC/public domain)', 'open data'),
    # Crypto exchange ToS — RISKY (redistribution prohibited)
    (r'^(kraken|coinbase|binance|bitstamp|gemini|okx|bybit|kucoin)-',
     'RISKY_EXCHANGE', 'Exchange ToS', 'crypto exchange'),
    # Commercial APIs
    (r'^(coinpaprika|coinmarketcap|whitebit|dailymotion|dexpaprika|coingecko)-',
     'RISKY_COMMERCIAL', 'Commercial API', 'commercial'),
    # Scraped / vague aggregators
    (r'^(ai-|anime|art-design|beauty|autonomous-tech|agent-census|affirmations)-',
     'REVIEW', 'Scraped/aggregated', 'unclear source'),
    # Sports/entertainment public APIs (ambiguous redistribution)
    (r'^espn-', 'REVIEW', 'Public API (unclear redistribution)', 'ESPN'),
]

def classify(sector):
    # 1. If in license map, use it
    if sector in licenses:
        info = licenses[sector]
        lic = (info.get("license") or "").lower()
        status = (info.get("status") or "").upper()
        source = info.get("source", "")
        if status == "REMOVED":
            return ("REMOVED", info.get("license", ""), source)
        if "non-commercial" in lic or "cc by-nc" in lic:
            return ("RISKY_NC", info.get("license"), source)
        if "share-alike" in lic or "cc by-sa" in lic:
            return ("RISKY_SA", info.get("license"), source)
        if "commercial api" in lic:
            return ("RISKY_COMMERCIAL", info.get("license"), source)
        if "exchange tos" in lic or "public market data" in lic:
            return ("RISKY_EXCHANGE", info.get("license"), source)
        if "unverified" in lic:
            return ("UNKNOWN", info.get("license"), source)
        if "public domain" in lic or "cc0" in lic:
            return ("SAFE_PD_CC0", info.get("license"), source)
        if "cc by" in lic:
            return ("SAFE_CC_BY", info.get("license"), source)
        if "mit" in lic:
            return ("SAFE_MIT", info.get("license"), source)
        if "free reuse, commercial ok" in lic:
            return ("SAFE_OPEN", info.get("license"), source)
        if "open" in lic or "free, keyless" in lic or "open public api" in lic:
            return ("SAFE_OPEN", info.get("license"), source)
        if "public api" in lic:
            return ("REVIEW", info.get("license"), source)
        return ("REVIEW", info.get("license"), source)
    # 2. Not in map — try prefix
    for pattern, cat, lic, src in PREFIX_RULES:
        if re.match(pattern, sector):
            return (cat, lic, src)
    # 3. Unknown
    return ("UNKNOWN", "not in license map", "unknown")

results = {s: classify(s) for s in active}
cats = Counter(r[0] for r in results.values())

print("=== CLASSIFICATION SUMMARY ===")
for cat in sorted(cats.keys()):
    print(f"  {cat:22} {cats[cat]:4}")

print()
safe_cats = ["SAFE_PD_CC0", "SAFE_CC_BY", "SAFE_MIT", "SAFE_OPEN"]
risky_cats = ["RISKY_NC", "RISKY_SA", "RISKY_EXCHANGE", "RISKY_COMMERCIAL", "UNKNOWN", "REVIEW", "REMOVED"]
total_safe = sum(cats.get(c, 0) for c in safe_cats)
total_risky = sum(cats.get(c, 0) for c in risky_cats)
print(f"SAFE:  {total_safe} sectors")
print(f"RISKY: {total_risky} sectors")

print("\n=== SAFE SECTORS (keep all) ===")
for s, (cat, lic, src) in sorted(results.items()):
    if cat in safe_cats:
        print(f"  [{cat:12}] {s}")

print("\n=== RISKY SECTORS (drop) ===")
for s, (cat, lic, src) in sorted(results.items()):
    if cat in risky_cats:
        print(f"  [{cat:15}] {s:40} {lic[:50]}")

# Save
Path("/tmp/compliance_classification.json").write_text(
    json.dumps({s: {"category": r[0], "license": r[1], "source": r[2]}
                for s, r in results.items()}, indent=2)
)
print(f"\n✅ Full classification saved to /tmp/compliance_classification.json")
