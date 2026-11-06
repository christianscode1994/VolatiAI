"""Audit that every active sector has a Worker block, and vice versa."""
import json, re
from pathlib import Path

active = set(json.load(open("config/active_sectors.json")))
all_blocks = set()
for worker in ("sector-dense", "sector-sparse", "sector-slow"):
    path = Path(f"workers/{worker}/src/index.js")
    if path.exists():
        all_blocks |= set(re.findall(r'^  "?([a-z0-9-]+)"?: \{', path.read_text(), re.MULTILINE))

missing = active - all_blocks
orphaned = all_blocks - active

print(f"active: {len(active)}, worker blocks: {len(all_blocks)}")
print(f"active with NO worker block: {len(missing)}" + (f" — {sorted(missing)}" if missing else " ✓"))
print(f"worker blocks with NO active sector: {len(orphaned)} (stubs — usually fine)")

# Exit non-zero if any active sector has no Worker block (hooks use this)
raise SystemExit(0 if not missing else 1)
