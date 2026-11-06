#!/usr/bin/env python3
"""Diagnose and resolve sector drift.

Drift types:
  1. active-no-worker    -- classified+active but no worker serves it
  2. worker-no-class     -- worker has COLLECTORS but not in classification
  3. worker-alias        -- worker sector looks like a rename of a classified one
  4. worker-truly-new    -- worker sector has no similar classified name

Behavior:
  Default: report only (dry-run)
  --apply: classify worker-truly-new, write reports/drift_resolved.json
  --prune-active: for active-no-worker, move them to config/planned_sectors.json

After --apply, re-runs sector_audit to show the improvement.
"""
import json, re, sys, subprocess, difflib
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent

def load(p, default=None):
    try: return json.loads((ROOT / p).read_text())
    except Exception: return default

def save(p, data):
    (ROOT / p).write_text(json.dumps(data, indent=2, sort_keys=True))

def get_active():
    for name in ("config/active_sectors.json", "config/sectors.json"):
        data = load(name)
        if data is None: continue
        if isinstance(data, list):
            return [s if isinstance(s, str) else (s.get("name") or s.get("id"))
                    for s in data if s]
        if isinstance(data, dict):
            inner = data.get("sectors")
            if isinstance(inner, list):
                return [s.get("name") or s.get("id") if isinstance(s, dict) else s
                        for s in inner if s]
            if isinstance(inner, dict): return list(inner.keys())
            return list(data.keys())
    return []

def get_workers():
    out = defaultdict(set)
    wdir = ROOT / "workers"
    if not wdir.exists(): return out
    for w in wdir.iterdir():
        if not w.is_dir(): continue
        idx = w / "src" / "index.js"
        if not idx.exists(): continue
        text = idx.read_text(errors="ignore")
        # Aggregate pattern: "name": { ... }
        for name in re.findall(r'^  "([a-z][a-z0-9-]+)":\s*\{', text, re.M):
            out[name].add(w.name)
        # Dedicated single-sector worker: const SECTOR = "..."
        for name in re.findall(r'const SECTOR\s*=\s*"([a-z][a-z0-9-]+)"', text):
            out[name].add(w.name)
    return out

def detect_aliases(orphan, classified_names):
    """Return list of classified names that might be aliases of `orphan`."""
    # Exact match after normalizing dashes/underscores
    norm = lambda s: s.replace("_", "-").lower()
    orphan_norm = norm(orphan)
    exact = [c for c in classified_names if norm(c) == orphan_norm and c != orphan]
    if exact: return ("exact", exact)

    # Substring (one contains the other)
    hits = []
    for c in classified_names:
        if orphan_norm in norm(c) or norm(c) in orphan_norm:
            hits.append(c)
    if hits:
        # Prefer closest by length diff
        hits.sort(key=lambda x: abs(len(x) - len(orphan)))
        return ("substring", hits[:3])

    # Fuzzy ratio > 0.85
    matches = difflib.get_close_matches(orphan, classified_names, n=3, cutoff=0.85)
    if matches: return ("fuzzy", matches)

    return (None, [])

def classify_new(new_names):
    """Add names to classification as 'other', then run classify_residue."""
    p = ROOT / "config/sector_categories_ollama.json"
    d = json.loads(p.read_text())
    added = 0
    for n in new_names:
        if n not in d:
            d[n] = "other"; added += 1
    p.write_text(json.dumps(d, indent=2, sort_keys=True))
    if added == 0:
        print(f"  (nothing new to classify)")
        return 0
    print(f"  added {added} sectors as 'other', running classifier...")
    r = subprocess.run(["python3", str(ROOT / "classify_residue.py")],
                       cwd=ROOT, capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
    return added

def main():
    apply_mode = "--apply" in sys.argv
    prune_mode = "--prune-active" in sys.argv and apply_mode

    classification = load("config/sector_categories_ollama.json", {}) or {}
    active = get_active()
    workers = get_workers()

    c_set = set(classification)
    a_set = set(active)
    w_set = set(workers)

    # === Drift detection ===
    worker_no_class = sorted(w_set - c_set)
    active_no_worker = sorted(a_set - w_set)

    print(f"classification:   {len(c_set)}")
    print(f"active:           {len(a_set)}  (gap vs classification: {len(a_set ^ c_set)})")
    print(f"worker coverage:  {len(w_set)}")
    print()

    # === Categorize orphans ===
    orphans = {"alias": [], "new": []}
    for name in worker_no_class:
        kind, matches = detect_aliases(name, c_set)
        if kind:
            orphans["alias"].append({"sector": name, "kind": kind, "matches": matches})
        else:
            orphans["new"].append({"sector": name})

    print(f"Orphans (worker but not classified): {len(worker_no_class)}")
    print(f"  likely alias of existing sector: {len(orphans['alias'])}")
    print(f"  truly new:                       {len(orphans['new'])}")
    print()
    print(f"Active but no worker: {len(active_no_worker)}")
    print()

    # === Show samples ===
    if orphans["alias"]:
        print("Sample aliases (probably renames):")
        for a in orphans["alias"][:5]:
            print(f"  {a['sector']:40s} <- {', '.join(a['matches'])}")
        print()

    if orphans["new"]:
        print("Sample truly-new (will be classified):")
        for o in orphans["new"][:10]:
            print(f"  {o['sector']}")
        print()

    if active_no_worker:
        print("Sample active-no-worker (needs decision):")
        for n in active_no_worker[:10]:
            print(f"  {n}")
        print()

    # === Write report ===
    report = {
        "generated": __import__("datetime").datetime.now().isoformat(),
        "counts": {
            "classification": len(c_set),
            "active": len(a_set),
            "workers": len(w_set),
            "worker_no_class": len(worker_no_class),
            "active_no_worker": len(active_no_worker),
            "aliases": len(orphans["alias"]),
            "new": len(orphans["new"]),
        },
        "aliases": orphans["alias"],
        "new": orphans["new"],
        "active_no_worker": active_no_worker,
    }
    Path(ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "drift_report.json").write_text(json.dumps(report, indent=2))

    # === Apply ===
    if not apply_mode:
        print("(dry-run; use --apply to classify new orphans)")
        print(f"report written: reports/drift_report.json")
        return

    print("=== APPLYING ===")
    if orphans["new"]:
        names = [o["sector"] for o in orphans["new"]]
        classify_new(names)
    else:
        print("  no new orphans to classify")

    if prune_mode and active_no_worker:
        planned = load("config/planned_sectors.json", []) or []
        planned_set = set(planned)
        for n in active_no_worker:
            planned_set.add(n)
        save("config/planned_sectors.json", sorted(planned_set))

        # Remove from active
        for name in ("config/active_sectors.json", "config/sectors.json"):
            data = load(name)
            if data is None: continue
            if isinstance(data, list):
                new_data = [s for s in data
                            if (s if isinstance(s, str) else s.get("name") or s.get("id"))
                               not in set(active_no_worker)]
                save(name, new_data)
            elif isinstance(data, dict):
                if isinstance(data.get("sectors"), list):
                    data["sectors"] = [s for s in data["sectors"]
                                       if (s.get("name") or s.get("id")
                                           if isinstance(s, dict) else s)
                                          not in set(active_no_worker)]
                    save(name, data)
        print(f"  moved {len(active_no_worker)} sectors to config/planned_sectors.json")

    print()
    print("=== RE-RUN AUDIT ===")
    subprocess.run(["python3", str(ROOT / "sector_audit.py")], cwd=ROOT)

if __name__ == "__main__":
    main()
