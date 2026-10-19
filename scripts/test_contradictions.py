#!/usr/bin/env python3
"""Test find_contradictions() with synthetic data."""

import sys
sys.path.insert(0, 'scripts')

from epistemic_digest import find_contradictions

def make_arb(sector, confidence):
    return {"sector": sector, "confidence": confidence}

def make_env(sector, metric, current, pct=None):
    return {"delta": {"metric": metric, "current": current, "pct_change": pct}}

print("=== Test 1: Same metric, divergent values (WTI) ===")
arbs = [make_arb("energy", 1.0), make_arb("shopping", 1.0)]
envs = {
    "energy": make_env("energy", "wti", 97.98),
    "shopping": make_env("shopping", "wti", 85.20),  # 14% lower
}
result = find_contradictions(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["type"] == "metric_divergence"
assert result[0]["metric"] == "wti"
assert result[0]["divergence_pct"] > 10
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 2: Same metric via aliases (treasury_10y vs yield_10y) ===")
arbs = [make_arb("finance", 1.0), make_arb("treasuries", 1.0)]
envs = {
    "finance": make_env("finance", "treasury_10y", 5.10),
    "treasuries": make_env("treasuries", "yield_10y", 4.20),  # 19% lower
}
result = find_contradictions(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["metric"] == "us_10y_yield"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 3: Directional conflict (same metric, opposite signs) ===")
arbs = [make_arb("A", 1.0), make_arb("B", 1.0)]
envs = {
    "A": make_env("A", "gas_price", 10.0, +25.0),
    "B": make_env("B", "gas_price", 10.5, -15.0),
}
result = find_contradictions(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["type"] == "directional_conflict"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 4: No contradiction (identical values) ===")
arbs = [make_arb("energy", 1.0), make_arb("shopping", 1.0)]
envs = {
    "energy": make_env("energy", "wti", 97.98, +2.0),
    "shopping": make_env("shopping", "wti", 97.98, +2.0),
}
result = find_contradictions(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print(f"  ✓ PASS: no contradictions")

print("\n=== Test 5: Different metrics, no comparison ===")
arbs = [make_arb("blockchain", 1.0), make_arb("vix_sector", 1.0)]
envs = {
    "blockchain": make_env("blockchain", "gas_price", 10.0),
    "vix_sector": make_env("vix_sector", "vix", 18.5),
}
result = find_contradictions(arbs, envs)
assert len(result) == 0
print(f"  ✓ PASS: no false positives")

print("\n✅ ALL TESTS PASS")
