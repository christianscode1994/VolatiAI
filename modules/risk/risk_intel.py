import random
import time


def _norm(x, low, high):
    """Normalize x into [0,1] range."""
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def _mock_volatility_spike():
    """Mock volatility spike index."""
    return round(random.uniform(0.0, 1.0), 3)


def _mock_liquidity_drop():
    """Mock liquidity drop percentage."""
    return round(random.uniform(0.0, 0.6), 3)


def _mock_whale_dominance():
    """Mock whale dominance ratio."""
    return round(random.uniform(0.1, 0.9), 3)


def _mock_manipulation_prob():
    """Mock spoofing/manipulation probability."""
    return round(random.uniform(0.0, 0.5), 3)


def _mock_liquidation_risk():
    """Mock liquidation cluster risk."""
    return round(random.uniform(0.0, 1.0), 3)


def compute_risk_intel():
    """
    Risk intelligence engine v1.
    Replace mocks with real API calls later.
    """

    vol_spike = _mock_volatility_spike()
    liq_drop = _mock_liquidity_drop()
    whale_dom = _mock_whale_dominance()
    manip_prob = _mock_manipulation_prob()
    liq_risk = _mock_liquidation_risk()

    vol_score = vol_spike
    liq_score = liq_drop
    whale_score = whale_dom
    manip_score = manip_prob
    liquidation_score = liq_risk

    # Risk score: higher = more dangerous
    risk_score = (
        0.30 * vol_score +
        0.25 * liq_score +
        0.20 * whale_score +
        0.15 * manip_score +
        0.10 * liquidation_score
    )

    return {
        "timestamp": int(time.time()),
        "volatility_spike": vol_spike,
        "liquidity_drop": liq_drop,
        "whale_dominance": whale_dom,
        "manipulation_probability": manip_prob,
        "liquidation_risk": liq_risk,
        "scores": {
            "volatility_score": round(vol_score, 3),
            "liquidity_score": round(liq_score, 3),
            "whale_score": round(whale_score, 3),
            "manipulation_score": round(manip_score, 3),
            "liquidation_score": round(liquidation_score, 3),
            "risk_score": round(risk_score, 3),
        }
    }
