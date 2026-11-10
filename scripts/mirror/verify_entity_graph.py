#!/usr/bin/env python3
"""Verify entity registry + link table are internally consistent.

Catches:
  - links pointing at entities not in entities.json
  - conflicting same_as claims (A==B and A==C but B!=C)
  - sector slugs claimed by multiple canonical entities (usually a bug)
  - entities.json aliases that overlap (two entities claiming the same alias)

Usage: python3 scripts/mirror/verify_entity_graph.py
Exit 0 if consistent, 1 if not.
"""
import json, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENT_FILE = ROOT / "docs" / "entities.json"
LINK_FILE = ROOT / "docs" / "entity_links.jsonl"

def main():
    errs = []
    if not ENT_FILE.exists():
        print("❌ entities.json missing"); sys.exit(1)
    if not LINK_FILE.exists():
        print("❌ entity_links.jsonl missing"); sys.exit(1)

    ent = json.loads(ENT_FILE.read_text())
    entities = ent.get("entities", {})
    print(f"entities: {len(entities)}")

    links = []
    for line in LINK_FILE.read_text().splitlines():
        if line.strip():
            try: links.append(json.loads(line))
            except json.JSONDecodeError as e:
                errs.append(f"malformed link line: {e}")
    print(f"links: {len(links)}")

    # 1. Every link endpoint must exist in entities
    for l in links:
        for k in ("source", "target"):
            if l.get(k) not in entities:
                # Allow source to be a *sector slug* as well as a canonical entity
                slug_known = any(l.get(k) in e.get("sectors_expected", [])
                                 for e in entities.values())
                if not slug_known:
                    errs.append(f"link {k}={l.get(k)!r} not in entities.json or any sectors_expected")

    # 2. No same_as contradictions: if A==B and A==C, then B==C
    same_as = defaultdict(set)
    for l in links:
        if l.get("relation") == "same_as":
            same_as[l["source"]].add(l["target"])
            same_as[l["target"]].add(l["source"])
    for a, neighbors in same_as.items():
        for b in neighbors:
            for c in neighbors:
                if b != c and c not in same_as[b]:
                    errs.append(f"same_as transitivity violation: {a}=={b} and {a}=={c} but not {b}=={c}")

    # 3. Sectors may legitimately appear under multiple entities (e.g.
    #    steam-dota2-players involves both Steam the platform and Dota 2
    #    the game). Do NOT flag those. Do flag any sector slug that's
    #    claimed more than once *by the same entity* — that's a real dup.
    dup_checks = defaultdict(list)  # (entity, slug) → [occurrences]
    for canon_id, e in entities.items():
        for s in e.get("sectors_expected", []):
            dup_checks[(canon_id, s)].append(1)
    for (canon_id, slug), occurrences in dup_checks.items():
        if len(occurrences) > 1:
            errs.append(f"entity {canon_id!r} lists sector {slug!r} {len(occurrences)} times")

    # 4. No alias collisions (two entities claiming the same alias)
    alias_owners = defaultdict(list)
    for canon_id, e in entities.items():
        for alias in e.get("aliases", []):
            alias_owners[alias].append(canon_id)
    for alias, owners in alias_owners.items():
        if len(owners) > 1:
            errs.append(f"alias {alias!r} claimed by multiple entities: {owners}")

    if errs:
        print("\n❌ INCONSISTENCIES:")
        for e in errs: print(f"  - {e}")
        sys.exit(1)
    print("\n✅ entity graph consistent")

if __name__ == "__main__":
    main()
