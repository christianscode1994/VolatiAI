"""Audit that no restricted-API source is referenced in Worker code."""
import re
from pathlib import Path

# Known restricted sources — add as discovered
RESTRICTED = {
    "opensky-network.org": "OpenSky (CC BY-NC 4.0)",
    "funding.tech.eu": "Tech.eu (CC BY 4.0)",
    "windsordrake.com": "Windsor Drake (attribution)",
    "econdb.com": "EconDB (commercial)",
}

hits = []
for worker_dir in Path("workers").iterdir():
    js = worker_dir / "src" / "index.js"
    if not js.exists():
        continue
    s = js.read_text()
    for domain, license_name in RESTRICTED.items():
        if domain in s:
            # Find line numbers
            for i, line in enumerate(s.split("\n"), 1):
                if domain in line:
                    hits.append(f"{js}:{i}  {domain}  ({license_name})")

if hits:
    print("RESTRICTED SOURCES FOUND IN WORKER CODE:")
    for h in hits:
        print(f"  {h}")
    print("\nEach of these should be either:")
    print("  - Removed from the Worker")
    print("  - Approved with attribution in source_licenses.json")
else:
    print("✓ No restricted sources in Worker code")

# Exit non-zero if any restricted source found (hooks use this)
raise SystemExit(1 if hits else 0)
