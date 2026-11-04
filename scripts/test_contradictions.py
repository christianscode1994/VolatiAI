#!/usr/bin/env python3
"""Test find_contradictions() with synthetic FX data.

Updated Nov 4 2026. The previous version tested sectors "energy",
"shopping", "finance", "treasuries", etc. — none of which exist in
the current CONFLICT_GROUPS (only currency-ex and exchange-rate, both
in fx_usd_eur group). Every test silently returned 0 because unknown
sectors get skipped by 'if not group: continue' before comparison.

This test file now matches the actual scope: FX-only, 2 sectors,
reciprocal normalization. If CONFLICT_GROUPS expands, add new tests
for the new sectors alongside this file.
"""
import sys
sys.path.insert(0, 'scripts')

from epistemic_digest import find_contradictions


def make_arb(sector, confidence=1.0):
    return {"sector": sector, "confidence": confidence}


def make_env(metric, current, pct=None):
    return {"delta": {"metric": metric, "current": current, "pct_change": pct}}


# ── Test 1: FX divergence exceeds 10% after reciprocal normalization ──
# currency-ex reports EUR/USD = 1.12
# exchange-rate reports USD→EUR = 0.75, which is 1/0.75 = 1.333 after
# reciprocal normalization. Difference: |1.12 - 1.333| / 1.333 ≈ 16%.
print("=== Test 1: FX reciprocal divergence >10% ===")
arbs = [make_arb("currency-ex"), make_arb("exchange-rate")]
envs = {
    "currency-ex": make_env("eur_usd", 1.12),
    "exchange-rate": make_env("usd_eur", 0.75),  # reciprocal: 1.333
}
result = find_contradictions(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}: {result}"
assert result[0]["type"] == "metric_divergence", f"type={result[0]['type']}"
assert result[0]["divergence_pct"] > 10, f"divergence={result[0]['divergence_pct']}"
print(f"  ✓ divergence={result[0]['divergence_pct']:.2f}%")


# ── Test 2: FX reciprocal agreement → no false positive ──
# currency-ex 1.12, exchange-rate 0.8929 → reciprocal 1.1199.
# Difference: ~0.01%. Well below 10% threshold.
print("\n=== Test 2: FX reciprocal agreement, no contradiction ===")
arbs = [make_arb("currency-ex"), make_arb("exchange-rate")]
envs = {
    "currency-ex": make_env("eur_usd", 1.12),
    "exchange-rate": make_env("usd_eur", 0.8929),
}
result = find_contradictions(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}: {result}"
print("  ✓ no false positive")


# ── Test 3: Only one sector in group → no comparison possible ──
# Both sectors are in fx_usd_eur, but only one has data.
print("\n=== Test 3: Single FX source, no comparison ===")
arbs = [make_arb("currency-ex")]
envs = {"currency-ex": make_env("eur_usd", 1.12)}
result = find_contradictions(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print("  ✓ no comparison without second source")


# ── Test 4: Unknown sector skipped ──
# 'energy' is not in CONFLICT_GROUPS. Should be ignored.
print("\n=== Test 4: Unknown sector skipped ===")
arbs = [make_arb("energy"), make_arb("currency-ex")]
envs = {
    "energy": make_env("wti", 97.98),
    "currency-ex": make_env("eur_usd", 1.12),
}
result = find_contradictions(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print("  ✓ unknown sector ignored")


# ── Test 5: 'none' metric → skipped ──
# Both FX sectors have metric='none', so comparison skipped.
print("\n=== Test 5: 'none' metric, skipped ===")
arbs = [make_arb("currency-ex"), make_arb("exchange-rate")]
envs = {
    "currency-ex": make_env("none", 0),
    "exchange-rate": make_env("none", 0),
}
result = find_contradictions(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print("  ✓ none-metric ignored")


print("\n✅ ALL TESTS PASS")
