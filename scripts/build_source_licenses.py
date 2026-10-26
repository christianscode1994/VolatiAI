"""Generate config/source_licenses.json by categorizing every sector."""
import json, re
from pathlib import Path

# Pattern → category
PATTERNS = [
    # ─── US Public Domain (17 USC § 105) ───
    (r'^(nws|usgs|noaa|sec|fdic|cdc|census|bts|miso|federal|bls|bea|nasa|epa|nhtsa|faa|fbi|state-dept|fema)-', 'us_pd'),
    (r'^federal-', 'us_pd'),
    (r'^(treasuries|treasury)-', 'us_pd'),
    (r'^census-', 'us_pd'),
    # ─── CC0 ───
    (r'^gleif-', 'cc0'),
    # ─── CC BY 4.0 (attribution) ───
    (r'^(worldbank|eurostat|gbif|obis|bfs|prh|geonet|nhm|idigbio|open-meteo|crossref|openlibrary|baltic|7timer|energinet|uk-carbon|sunrise|frankfurter)-', 'cc_by'),
    # ─── MIT / very permissive ───
    (r'^gutendex-', 'mit'),
    (r'^(randomuser|zippopotam|langpop|datafirst|gdacs|restcountries)-', 'permissive'),
    (r'^(pubmed|europepmc)-', 'permissive'),
    (r'^(open-sanctions|opensanctions)-', 'permissive'),
]

# Explicit overrides
OVERRIDES = {
    # Known attribution
    "frankfurter-eur-usd": "permissive",
    "sunrise-berlin-daylength": "permissive",
    "gdacs-active-disasters": "permissive",
    "datafirst-african-surveys": "permissive",
}

active = json.loads(Path("config/active_sectors.json").read_text())

result = {}
for sector in active:
    if sector in OVERRIDES:
        result[sector] = OVERRIDES[sector]
        continue
    matched = False
    for pattern, category in PATTERNS:
        if re.match(pattern, sector):
            result[sector] = category
            matched = True
            break
    if not matched:
        result[sector] = "unknown"  # needs individual review

# Group by category for the JSON output
by_category = {}
for sector, cat in sorted(result.items()):
    by_category.setdefault(cat, []).append(sector)

output = {
    "generated": "2026-10-26",
    "categories": {
        "us_pd":       {"description": "U.S. government public domain", "sectors": by_category.get("us_pd", [])},
        "cc0":         {"description": "CC0 public domain dedication", "sectors": by_category.get("cc0", [])},
        "cc_by":       {"description": "CC BY 4.0 — attribution required", "sectors": by_category.get("cc_by", [])},
        "mit":         {"description": "MIT license — attribution appreciated", "sectors": by_category.get("mit", [])},
        "permissive":  {"description": "Public API, open data", "sectors": by_category.get("permissive", [])},
        "unknown":     {"description": "Unverified license", "sectors": by_category.get("unknown", [])},
    },
    "counts": {cat: len(items) for cat, items in by_category.items()},
}

Path("config/source_licenses.json").write_text(json.dumps(output, indent=2) + "\n")

print(f"✅ Generated config/source_licenses.json")
for cat in ["us_pd", "cc0", "cc_by", "mit", "permissive", "unknown"]:
    count = output["counts"].get(cat, 0)
    print(f"  {cat:12} {count:4} sectors")

if output["counts"].get("unknown", 0) > 0:
    print(f"\n⚠️  {output['counts']['unknown']} sectors have unknown license — review manually:")
    for s in output["categories"]["unknown"]["sectors"][:20]:
        print(f"    {s}")
