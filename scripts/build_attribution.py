"""Generate public/attribution.json from source_licenses.json.

Call from local_runner after fetching sectors. One read of the license map.
"""
import json
from pathlib import Path

LICENSE = Path("config/source_licenses.json")
OUT = Path("public/attribution.json")

def main():
    data = json.loads(LICENSE.read_text())

    # Group by attribution string; a single attribution covers multiple sectors
    groups = {}
    for sector, entry in data.items():
        att = entry.get("attribution")
        lic = entry.get("license")
        cat = entry.get("category", "")
        if not att:
            continue
        key = (att, lic)
        groups.setdefault(key, {"category": cat, "sectors": []})
        groups[key]["sectors"].append(sector)

    attributions = []
    for (att, lic), info in sorted(groups.items()):
        attributions.append({
            "attribution": att,
            "license": lic,
            "category": info["category"],
            "sectors": sorted(info["sectors"]),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "note": "Attribution required by each source's license. Derived signals only; no raw data redistributed.",
        "sources": attributions,
    }, indent=2, ensure_ascii=False) + "\n")
    print(f"✅ wrote {OUT} ({len(attributions)} attribution groups)")

if __name__ == "__main__":
    main()

# Tier 1 — refresh SHA-256 checksums after writing data files
if __name__ == "__main__":
    import subprocess
    subprocess.run(["python3", "scripts/generate_checksums.py"], check=False)
