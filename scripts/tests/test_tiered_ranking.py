"""Regression test: tiered ranking must place alert-tier above warn-tier
regardless of |pct_change| magnitude."""
import sys
sys.path.insert(0, '.')

_TIER = {"alert": 0, "critical": 1, "warning": 2, "notice": 3, "info": 4}
def _tier_rank(kv):
    name, data = kv
    return (_TIER.get((data.get("severity") or "").lower(), 9), -abs(data.get("pct_change") or 0))

def test_warn_680_loses_to_alert_75():
    candidates = [
        ("btc-exchange-spread", {"severity": "warn",  "pct_change": 680}),
        ("nvd-new-cves-count",  {"severity": "alert", "pct_change": -75}),
    ]
    ranked = sorted(candidates, key=_tier_rank)
    assert ranked[0][0] == "nvd-new-cves-count", f"expected nvd first, got {ranked[0][0]}"
    assert ranked[1][0] == "btc-exchange-spread"

def test_alert_magnitude_orders_within_tier():
    candidates = [
        ("hn", {"severity": "alert", "pct_change": 390}),
        ("nvd", {"severity": "alert", "pct_change": 262}),
        ("csgo", {"severity": "alert", "pct_change": -91}),
    ]
    ranked = sorted(candidates, key=_tier_rank)
    assert [n for n, _ in ranked] == ["hn", "nvd", "csgo"]

if __name__ == "__main__":
    test_warn_680_loses_to_alert_75()
    test_alert_magnitude_orders_within_tier()
    print("PASS")
