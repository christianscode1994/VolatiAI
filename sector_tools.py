#!/usr/bin/env python3
"""Query and inspect config/sector_categories_ollama.json.

Usage:
  python3 sector_tools.py lookup <sector>
  python3 sector_tools.py by-cat <category>
  python3 sector_tools.py categories
  python3 sector_tools.py stats
  python3 sector_tools.py search <substring>
  python3 sector_tools.py diff <old.json> <new.json>
"""
import json
import sys
from collections import Counter
from pathlib import Path

JSON_PATH = Path("config/sector_categories_ollama.json")


def load(path=JSON_PATH):
    return json.loads(Path(path).read_text())


def cmd_lookup(sector):
    d = load()
    if sector not in d:
        print(f"not found: {sector}", file=sys.stderr)
        sys.exit(1)
    print(d[sector])


def cmd_by_cat(category):
    d = load()
    names = sorted(k for k, v in d.items() if v == category)
    if not names:
        print(f"no sectors in category: {category}", file=sys.stderr)
        sys.exit(1)
    for n in names:
        print(n)


def cmd_categories():
    d = load()
    c = Counter(d.values())
    for cat, n in c.most_common():
        print(f"{cat:15s} {n:4d}")


def cmd_stats():
    d = load()
    c = Counter(d.values())
    t = sum(c.values())
    bad = c.get("other", 0) + c.get("error", 0) + c.get("unclassified", 0)
    print(f"total={t}  categories={len(c)}  unknown={bad} ({bad*100//t}%)")
    print()
    for cat, n in c.most_common():
        bar = "#" * (n * 40 // t)
        print(f"  {cat:15s} {n:4d} ({n*100//t:2d}%)  {bar}")
    if bad > 0:
        print("\nUnclassified:")
        for k, v in d.items():
            if v in ("other", "error", "unclassified"):
                print(f"  {k}")


def cmd_search(substr):
    d = load()
    substr = substr.lower()
    hits = sorted(k for k in d if substr in k.lower())
    if not hits:
        print(f"no matches for: {substr}", file=sys.stderr)
        sys.exit(1)
    for h in hits:
        print(f"{h:40s} {d[h]}")


def cmd_diff(old_path, new_path):
    old = load(old_path)
    new = load(new_path)
    changed, added, removed = [], [], []
    for k in sorted(set(old) | set(new)):
        if k not in old:
            added.append((k, new[k]))
        elif k not in new:
            removed.append((k, old[k]))
        elif old[k] != new[k]:
            changed.append((k, old[k], new[k]))
    if not (changed or added or removed):
        print("(no changes)")
        return
    for k, o, n in changed:
        print(f"~ {k:40s} {o} -> {n}")
    for k, n in added:
        print(f"+ {k:40s} -> {n}")
    for k, o in removed:
        print(f"- {k:40s} was {o}")


COMMANDS = {
    "lookup":     (cmd_lookup, 1),
    "by-cat":     (cmd_by_cat, 1),
    "categories": (cmd_categories, 0),
    "stats":      (cmd_stats, 0),
    "search":     (cmd_search, 1),
    "diff":       (cmd_diff, 2),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    fn, argc = COMMANDS[sys.argv[1]]
    if len(sys.argv) - 2 != argc:
        print(f"{sys.argv[1]} takes {argc} arg(s)", file=sys.stderr)
        sys.exit(1)
    fn(*sys.argv[2:])
