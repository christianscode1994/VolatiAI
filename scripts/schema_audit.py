#!/usr/bin/env python3
"""schema_audit.py — find dead fields in briefing.json schema.

Walks every field in the current briefing.json and greps scripts/*.py
for references to that field name. Fields with zero references are
candidates for removal.

Note: a field with zero references in scripts/ could still be used
by an external consumer (an RSS reader, a bot). Use this as an audit
trail, not a mandate to delete.
"""
import json
import re
import sys
from pathlib import Path

BRIEFING = Path("docs/briefing.json")
SCRIPTS = Path("scripts")


def extract_fields(b):
    """Return list of (path, sample_value) for every field in briefing.json."""
    fields = []
    for k in b.keys():
        fields.append((k, b[k]))
    for parent in ("briefing", "delta", "stats"):
        if parent in b and isinstance(b[parent], dict):
            for k in b[parent].keys():
                fields.append((parent + "." + k, b[parent][k]))
    if b.get("signals"):
        for k in b["signals"][0].keys():
            fields.append(("signals[]." + k, b["signals"][0][k]))
    if b.get("watchlist"):
        for k in b["watchlist"][0].keys():
            fields.append(("watchlist[]." + k, b["watchlist"][0][k]))
    return fields


WRITER = "briefing.py"


def find_usage(field_path):
    """Return set of filenames that reference this field.

    Writer (briefing.py) is excluded from "readers" — a field that only
    appears in the file that writes it is write-only dead schema, not
    actually consumed by anything.
    """
    leaf = field_path.split(".")[-1].split("[")[0]
    if not leaf:
        return set()
    pattern = r"\b" + re.escape(leaf) + r"\b"
    matches = set()
    for py in SCRIPTS.glob("*.py"):
        try:
            text = py.read_text()
        except Exception:
            continue
        if re.search(pattern, text):
            matches.add(py.name)
    return matches


def main():
    if not BRIEFING.exists():
        print("error: " + str(BRIEFING) + " not found", file=sys.stderr)
        return 1
    b = json.loads(BRIEFING.read_text())
    fields = extract_fields(b)

    print("\n=== Schema Audit (" + str(len(fields)) + " fields) ===\n")
    print("  {:<40} {:>6}  status".format("field", "files"))
    print("  " + "-" * 62)

    dead = []
    write_only = []
    for path, _ in fields:
        files = find_usage(path)
        readers = files - {WRITER}
        if not files:
            status, marker = "DEAD", "!"
            dead.append(path)
        elif not readers:
            status, marker = "write-only", "!"
            write_only.append(path)
        else:
            status, marker = "used", " "
        file_list = ", ".join(sorted(readers)) if readers else "(briefing.py only)"
        print("  {} {:<40} {:>2}  {:<11} {}".format(
            marker, path, len(readers), status, file_list[:40]))

    if dead:
        print("\n  DEAD — referenced nowhere in scripts/:")
        for d in dead:
            print("    " + d)
    if write_only:
        print("\n  WRITE-ONLY — referenced only by briefing.py (no consumer):")
        for d in write_only:
            print("    " + d)
    if not dead and not write_only:
        print("\n  All fields are read by at least one tool outside briefing.py.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
