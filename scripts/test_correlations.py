#!/usr/bin/env python3
import sys
sys.path.insert(0, 'scripts')
from epistemic_digest import find_correlation_anomalies

def make_arb(sector):
    return {"sector": sector, "confidence": 1.0}

def make_env(metric, pct, current=100):
    return {"delta": {"metric": metric, "current": current, "pct_change": pct}}

print("=== Test 1: S&P up + VIX up = anomaly (both should be inverse) ===")
arbs = [make_arb("stocks"), make_arb("tracking")]
envs = {
    "stocks": make_env("sp500", +2.0),
    "tracking": make_env("vix", +3.0),
}
result = find_correlation_anomalies(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["rule"] == "sp500_vix"
assert result[0]["observed"] == "same_direction"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 2: S&P up + VIX down = normal (inverse, skip) ===")
envs = {
    "stocks": make_env("sp500", +2.0),
    "tracking": make_env("vix", -3.0),
}
result = find_correlation_anomalies(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print(f"  ✓ PASS: no anomaly detected")

print("\n=== Test 3: Gold up + DXY up = anomaly ===")
arbs = [make_arb("metals"), make_arb("finance")]
envs = {
    "metals": make_env("gold", +1.5),
    "finance": make_env("dxy", +1.2),
}
result = find_correlation_anomalies(arbs, envs)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["rule"] == "gold_dxy"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 4: One metric quiet, other moves = no anomaly ===")
envs = {
    "metals": make_env("gold", +1.5),
    "finance": make_env("dxy", +0.1),  # below min_move_pct
}
result = find_correlation_anomalies(arbs, envs)
assert len(result) == 0, f"Expected 0, got {len(result)}"
print(f"  ✓ PASS: insufficient data, no false positive")

print("\n=== Test 5: WTI divergence = anomaly (should correlate) ===")
arbs = [make_arb("energy"), make_arb("shopping")]
envs = {
    "energy": make_env("wti", +2.0),
    "shopping": make_env("wti", -3.0),
}
result = find_correlation_anomalies(arbs, envs)
assert len(result) == 1
assert result[0]["rule"] == "wti_energy"
print(f"  ✓ PASS: {result[0]}")

print("\n✅ ALL CORRELATION TESTS PASS")
