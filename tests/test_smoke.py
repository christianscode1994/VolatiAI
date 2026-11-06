#!/usr/bin/env python3
"""Smoke tests for the classification pipeline.

Run: python3 tests/test_smoke.py
Or:  pytest tests/
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_prefix_matches():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    assert cr.by_prefix("crates-io") == "developer"
    assert cr.by_prefix("crossref-works") == "research"
    assert cr.by_prefix("faa-nearby") == "transport"
    assert cr.by_prefix("nothing-matches-xyz") is None


def test_prefix_values_are_cats():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    for k, v in cr.PREFIX.items():
        assert v in cr.CATS, f"prefix {k!r} -> invalid category {v!r}"


def test_exact_values_are_cats():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    for k, v in cr.EXACT.items():
        assert v in cr.CATS, f"exact {k!r} -> invalid category {v!r}"


def test_normalize_map():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    out = cr.normalize_labels({"a": "defi", "b": "crypto"}, {"a", "b", "c"})
    assert out == {"a": "defi", "b": "crypto"}


def test_normalize_list():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    out = cr.normalize_labels([{"sector": "x", "category": "media"}], {"x"})
    assert out == {"x": "media"}


def test_normalize_nested():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    out = cr.normalize_labels({"sectors": {"x": "defi"}}, {"x"})
    assert out == {"x": "defi"}


def test_data_has_no_unknowns():
    d = json.loads((ROOT / "config" / "sector_categories_ollama.json").read_text())
    bad = [k for k, v in d.items() if v in ("other", "error", "unclassified")]
    assert not bad, f"{len(bad)} unknown: {bad[:5]}..."


def test_data_categories_are_valid():
    import os
    os.chdir(ROOT)
    import classify_residue as cr
    d = json.loads((ROOT / "config" / "sector_categories_ollama.json").read_text())
    bad = {v for v in d.values()} - set(cr.CATS)
    assert not bad, f"unknown categories in data: {bad}"


if __name__ == "__main__":
    g = globals()
    fails = 0
    for name in sorted(n for n in g if n.startswith("test_")):
        try:
            g[name]()
            print(f"PASS {name}")
        except AssertionError as e:
            print(f"FAIL {name}: {e}"); fails += 1
        except Exception as e:
            print(f"ERR  {name}: {type(e).__name__}: {e}"); fails += 1
    print(f"\n{fails} failure(s)")
    sys.exit(1 if fails else 0)
