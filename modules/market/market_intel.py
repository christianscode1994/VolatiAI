import random
import time


def _norm(x, low, high):
    """Normalize x into [0,1] range."""
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def _mock_price():
    """Mock price feed (replace with real API later)."""
    return round(100 + random.uniform(-5, 5), 2)


def _mock_volume():
    """Mock volume feed."""
    return round(random.uniform(1_000_000, 5_000_000), 2)


def _mock_liquidity():
    """Mock liquidity depth."""
    return round(random.uniform(500_000, 2_000_000), 2)


def _mock_volatility():
    """Mock volatility index."""
    return round(random.uniform(0.5, 3.0), 2)


def _mock_funding_rate():
    """Mock funding rate."""
    return round(random.uniform(-0.02, 0.02), 4)


def _mock_open_interest():
    """Mock OI."""
    return round(random.uniform(50_000_000, 150_000_000), 2)


def compute_market_intel():
    """
    Market intelligence engine v1.
    Replace mocks with real API calls later.
    """

    price = _mock_price()
    volume = _mock_volume()
    liquidity = _mock_liquidity()
    volatility = _mock_volatility()
    funding = _mock_funding_rate()
    oi = _mock_open_interest()

    # Normalized signals
    vol_score = _norm(volatility, 0.5, 3.0)
    liq_score = _norm(liquidity, 500_000, 2_000_000)
    volm_score = _norm(volume, 1_000_000, 5_000_000)
    oi_score = _norm(oi, 50_000_000, 150_000_000)

    # Market health score
    market_score = (
        0.25 * (1 - vol_score) +   # lower volatility = healthier
        0.25 * liq_score +         # deeper liquidity = healthier
        0.25 * volm_score +        # higher volume = healthier
        0.25 * oi_score            # higher OI = healthier
    )

    return {
        "timestamp": int(time.time()),
        "price": price,
        "volume": volume,
        "liquidity": liquidity,
        "volatility": volatility,
        "funding_rate": funding,
        "open_interest": oi,
        "scores": {
            "volatility_score": round(vol_score, 3),
            "liquidity_score": round(liq_score, 3),
            "volume_score": round(volm_score, 3),
            "open_interest_score": round(oi_score, 3),
            "market_score": round(market_score, 3),
        }
    }
