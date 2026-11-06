#!/usr/bin/env python3
"""Cross-reference every sector against every source of truth.

Reads:
  config/sector_categories_ollama.json   (classification)
  config/active_sectors.json             (live sectors)
  config/sectors.json                    (fallback for active)
  workers/sector-*/src/index.js          (worker coverage)

Reports:
  - classified but not active
  - active but not classified
  - active but no worker
  - worker sector but not classified
  - per-worker sector count

Usage:
  python3 sector_audit.py
  python3 sector_audit.py --max 30    # show up to 30 items per gap list
"""
import json, re, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent

def load(p, default=None):
    try:
        return json.loads((ROOT / p).read_text())
    except Exception:
        return default

def get_active():
    for name in ("config/active_sectors.json", "config/sectors.json"):
        data = load(name)
        if data is None:
            continue
        if isinstance(data, list):
            return {s if isinstance(s, str) else (s.get("name") or s.get("id"))
                    for s in data if s}
        if isinstance(data, dict):
            inner = data.get("sectors")
            if isinstance(inner, list):
                return {s.get("name") or s.get("id") if isinstance(s, dict) else s
                        for s in inner if s}
            if isinstance(inner, dict):
                return set(inner.keys())
            return set(data.keys())
    return set()

def get_workers():
    out = defaultdict(set)
    wdir = ROOT / "workers"
    if not wdir.exists():
        return out
    for w in wdir.iterdir():
        if not w.is_dir(): continue
        idx = w / "src" / "index.js"
        if not idx.exists(): continue
        try:
            text = idx.read_text(errors="ignore")
        except Exception:
            continue
        # Aggregate pattern: "name": { ... }
        for name in re.findall(r'^  "([a-z][a-z0-9-]+)":\s*\{', text, re.M):
            out[name].add(w.name)
        # Dedicated single-sector worker: const SECTOR = "..."
        for name in re.findall(r'const SECTOR\s*=\s*"([a-z][a-z0-9-]+)"', text):
            out[name].add(w.name)
    return out

def main():
    max_n = 20
    if "--max" in sys.argv:
        i = sys.argv.index("--max")
        if i + 1 < len(sys.argv):
            try: max_n = int(sys.argv[i + 1])
            except ValueError: pass

    classification = load("config/sector_categories_ollama.json", {})
    active = get_active()
    workers = get_workers()

    print(f"classification: {len(classification):4d} sectors")
    print(f"active:         {len(active):4d} sectors"
          f"{' (no active_sectors.json found)' if not active else ''}")
    print(f"worker coverage: {len(workers):4d} sectors across "
          f"{len(set(w for ws in workers.values() for w in ws))} workers")
    print()

    gaps = []
    if active:
        x = sorted(set(classification) - active)
        if x: gaps.append(("classified but not in active_sectors.json", x))
        x = sorted(active - set(classification))
        if x: gaps.append(("active but not in classification", x))
    if active and workers:
        x = sorted(active - set(workers))
        if x: gaps.append(("active but no worker", x))
    if workers:
        x = sorted(set(workers) - set(classification))
        if x: gaps.append(("has worker but not classified", x))

    if not gaps:
        print("✓ No coverage gaps between classification, active, and workers")
    else:
        for label, items in gaps:
            print(f"✗ {label} ({len(items)}):")
            for it in items[:max_n]:
                print(f"    {it}")
            if len(items) > max_n:
                print(f"    ... and {len(items)-max_n} more")
            print()

    if workers:
        print("=== Per-worker sector count ===")
        by_worker = defaultdict(list)
        for sector, ws in workers.items():
            for w in ws: by_worker[w].append(sector)
        for w in sorted(by_worker, key=lambda x: -len(by_worker[x])):
            print(f"  {w:32s} {len(by_worker[w]):3d}")

    print("\n=== Suggested next actions ===")
    if not gaps:
        print("  Coverage is complete. Nothing to fix.")
    else:
        print("  - classified-not-active: add to active_sectors.json OR remove from classification")
        print("  - active-not-classified: run classify_residue.py OR add to EXACT dict")
        print("  - active-no-worker: create a worker OR confirm served by an aggregate")

if __name__ == "__main__":
    main()
