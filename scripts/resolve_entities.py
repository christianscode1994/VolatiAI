#!/usr/bin/env python3
"""resolve_entities.py — count resolved Wikidata QIDs per sector.

Exit 0 if resolved_count >= coverage_target (default: all in file).
Exit 1 if below target.

Usage:
  python3 scripts/resolve_entities.py                    # uses data/entity_qids.json
  python3 scripts/resolve_entities.py --file path.json   # custom file
  python3 scripts/resolve_entities.py --target 0.5       # fractional target

VERIFY:
  python3 scripts/resolve_entities.py --file tests/fixtures/entity_qids_test.json --target 1.0
  → exit 0 (test fixture is fully resolved)
"""
import argparse, json, re, sys
from pathlib import Path

QID_RE = re.compile(r'^Q[1-9][0-9]*$')

def load(path):
    return json.loads(Path(path).read_text())

def count(data):
    entities = data.get("entities", {})
    resolved = 0
    unresolved = []
    malformed = []
    for sid, e in entities.items():
        qid = e.get("qid")
        if qid is None:
            unresolved.append(sid)
        elif not QID_RE.match(qid):
            malformed.append((sid, qid))
        else:
            resolved += 1
    return len(entities), resolved, unresolved, malformed

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="data/entity_qids.json")
    ap.add_argument("--target", type=float, default=1.0,
                    help="fraction of entities that must be resolved (0.0–1.0)")
    args = ap.parse_args()

    data = load(args.file)
    total, resolved, unresolved, malformed = count(data)
    coverage = (resolved / total) if total else 0.0

    print(f"File:      {args.file}")
    print(f"Total:     {total}")
    print(f"Resolved:  {resolved}")
    print(f"Coverage:  {coverage:.2%} (target {args.target:.0%})")

    if malformed:
        print(f"\nMalformed QIDs ({len(malformed)}):")
        for sid, qid in malformed:
            print(f"  ✗ {sid}: {qid!r}")

    if unresolved and coverage < args.target:
        print(f"\nUnresolved ({len(unresolved)}):")
        for sid in unresolved[:20]:
            print(f"  - {sid}")

    if coverage < args.target:
        print(f"\n✗ Coverage below target")
        return 1
    print(f"\n✓ Coverage meets target")
    return 0

if __name__ == "__main__":
    sys.exit(main())
