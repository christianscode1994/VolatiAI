#!/usr/bin/env python3
"""validate_schemas.py - validate real worker output against JSON schemas.

Requires: pip install jsonschema

Fetches /_correlation from the live worker, validates each pair against
schemas/pair.schema.json, validates the overall response against
schemas/snapshot.schema.json. Catches if worker output drifts from the
documented contract.

Usage:
  python3 scripts/validate_schemas.py              # default: live worker
  VOLATIAI_BASE=https://... python3 scripts/validate_schemas.py
  python3 scripts/validate_schemas.py --snapshot   # also validate one snapshot

Exit: 0 = all valid, 1 = validation failed
"""
import json
import os
import sys
import ssl
import urllib.request
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: pip install jsonschema", file=sys.stderr)
    sys.exit(2)

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()


BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
SCHEMAS_DIR = Path(__file__).parent.parent / "schemas"


def load_schemas():
    schemas = {}
    for f in SCHEMAS_DIR.glob("*.schema.json"):
        schemas[f.name] = json.loads(f.read_text())
    store = {}
    for name, s in schemas.items():
        if "$id" in s:
            store[s["$id"]] = s
        store[name] = s
    return schemas, store


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI-validator/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
        return json.loads(r.read())


def validate(instance, schema, store, label):
    resolver = jsonschema.RefResolver.from_schema(schema, store=store)
    validator = jsonschema.Draft202012Validator(schema, resolver=resolver)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    if not errors:
        print(f"  OK {label}")
        return True
    print(f"  FAIL {label}: {len(errors)} error(s)")
    for e in errors[:5]:
        path = "/".join(str(p) for p in e.path) or "(root)"
        print(f"      {path}: {e.message}")
    return False


def main():
    schemas, store = load_schemas()
    print("=== Validating live output against schemas ===")
    print(f"  base: {BASE}")
    print()

    try:
        corr = fetch_json(f"{BASE}/_correlation")
    except Exception as e:
        print(f"ERROR fetching /_correlation: {e}", file=sys.stderr)
        return 2

    ok_count = 0
    fail_count = 0

    if validate(corr, schemas["snapshot.schema.json"], store, "snapshot shape"):
        ok_count += 1
    else:
        fail_count += 1

    pair_schema = schemas["pair.schema.json"]
    all_pairs_ok = True
    for i, pair in enumerate(corr.get("pairs", [])):
        label = f"pair[{i}] {pair.get('a','?')}<->{pair.get('b','?')}"
        if not validate(pair, pair_schema, store, label):
            all_pairs_ok = False
    if all_pairs_ok:
        ok_count += 1
    else:
        fail_count += 1

    if "--snapshot" in sys.argv:
        try:
            snap = fetch_json(f"{BASE}/_correlation?days=1")
            if validate(snap, schemas["snapshot.schema.json"], store, "days=1 snapshot shape"):
                ok_count += 1
            else:
                fail_count += 1
        except Exception as e:
            print(f"  (skipped --snapshot: {e})")

    print()
    print("=== Summary ===")
    print(f"Pass: {ok_count}")
    print(f"Fail: {fail_count}")

    if fail_count > 0:
        print()
        print("SCHEMA VALIDATION FAILED - worker output has drifted from contract")
        return 1
    print()
    print("All validations pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
