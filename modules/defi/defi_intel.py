import random
import time


def _norm(x, low, high):
    """Normalize x into [0,1] range."""
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def _mock_tvl():
    """Mock Total Value Locked."""
    return round(random.uniform(1_000_000_000, 5_000_000_000), 2)


def _mock_inflows():
    """Mock protocol inflows."""
    return round(random.uniform(10_000_000, 50_000_000), 2)


def _mock_outflows():
    """Mock protocol outflows."""
    return round(random.uniform(10_000_000, 50_000_000), 2)


def _mock_liquidation_clusters():
    """Mock liquidation cluster size."""
    return round(random.uniform(1_000_000, 10_000_000), 2)


def _mock_borrow_pressure():
    """Mock borrow pressure."""
    return round(random.uniform(0.1, 0.9), 2)


def compute_defi_intel():
    """
    DeFi intelligence engine v1.
    Replace mocks with real API calls later.
    """

    tvl = _mock_tvl()
    inflows = _mock_inflows()
    outflows = _mock_outflows()
    liquidations = _mock_liquidation_clusters()
    borrow_pressure = _mock_borrow_pressure()

    # Normalized signals
    tvl_score = _norm(tvl, 1_000_000_000, 5_000_000_000)
    inflow_score = _norm(inflows, 10_000_000, 50_000_000)
    outflow_score = 1 - _norm(outflows, 10_000_000, 50_000_000)
    liquidation_score = 1 - _norm(liquidations, 1_000_000, 10_000_000)
    borrow_score = 1 - borrow_pressure  # lower borrow pressure = healthier

    # DeFi health score
    defi_score = (
        0.25 * tvl_score +
        0.25 * inflow_score +
        0.20 * outflow_score +
        0.15 * liquidation_score +
        0.15 * borrow_score
    )

    return {
        "timestamp": int(time.time()),
        "tvl": tvl,
        "inflows": inflows,
        "outflows": outflows,
        "liquidation_clusters": liquidations,
        "borrow_pressure": borrow_pressure,
        "scores": {
            "tvl_score": round(tvl_score, 3),
            "inflow_score": round(inflow_score, 3),
            "outflow_score": round(outflow_score, 3),
            "liquidation_score": round(liquidation_score, 3),
            "borrow_score": round(borrow_score, 3),
            "defi_score": round(defi_score, 3),
        }
    }
