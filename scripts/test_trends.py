#!/usr/bin/env python3
import sys
sys.path.insert(0, 'scripts')
from epistemic_digest import detect_trends

def make_run(signals: dict, pcts: dict = None):
    """signals: {sector: has_signal_bool}; pcts: {sector: pct_change}"""
    sectors = {}
    for sector, sig in signals.items():
        sectors[sector] = {
            "has_signal": sig,
            "confidence": 1.0,
            "delta_current": 100,
            "metric": sector + "_metric",
            "pct_change": (pcts or {}).get(sector),
        }
    return {"timestamp": "test", "sectors": sectors}

print("=== Test 1: Persistent signal (same sector 3+ runs) ===")
history = {"runs": [
    make_run({"stocks": True}),
    make_run({"stocks": True}),
    make_run({"stocks": True}),
]}
result = detect_trends(history)
assert len(result) == 1, f"Expected 1, got {len(result)}"
assert result[0]["type"] == "persistent_signal"
assert result[0]["sector"] == "stocks"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 2: Sustained up direction (3+ runs) ===")
history = {"runs": [
    make_run({"metals": False}, {"metals": 1.5}),
    make_run({"metals": False}, {"metals": 2.0}),
    make_run({"metals": False}, {"metals": 1.8}),
]}
result = detect_trends(history)
assert len(result) == 1
assert result[0]["type"] == "sustained_direction"
assert result[0]["direction"] == "up"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 3: Sustained down direction (3+ runs) ===")
history = {"runs": [
    make_run({"stocks": False}, {"stocks": -1.2}),
    make_run({"stocks": False}, {"stocks": -2.5}),
    make_run({"stocks": False}, {"stocks": -0.8}),
]}
result = detect_trends(history)
assert len(result) == 1
assert result[0]["direction"] == "down"
print(f"  ✓ PASS: {result[0]}")

print("\n=== Test 4: Silence ended (quiet 3+ runs, now signaling) ===")
history = {"runs": [
    make_run({"news": False}),
    make_run({"news": False}),
    make_run({"news": False}),
    make_run({"news": True}),  # now signaling
]}
result = detect_trends(history)
assert any(t["type"] == "silence_ended" for t in result)
print(f"  ✓ PASS: {[t for t in result if t['type'] == 'silence_ended']}")

print("\n=== Test 5: Mixed directions = no sustained (opposite signs) ===")
history = {"runs": [
    make_run({"vix": False}, {"vix": 1.5}),
    make_run({"vix": False}, {"vix": -2.0}),  # opposite
    make_run({"vix": False}, {"vix": 1.8}),
]}
result = detect_trends(history)
sustained = [t for t in result if t["type"] == "sustained_direction"]
assert len(sustained) == 0
print(f"  ✓ PASS: no false positive for mixed directions")

print("\n=== Test 6: Single run = no trends ===")
history = {"runs": [make_run({"stocks": True})]}
result = detect_trends(history)
assert len(result) == 0
print(f"  ✓ PASS: insufficient history")

print("\n✅ ALL TREND TESTS PASS")
