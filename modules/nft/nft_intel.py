import random
import time


def _norm(x, low, high):
    """Normalize x into [0,1] range."""
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def _mock_floor_price():
    """Mock floor price."""
    return round(random.uniform(0.5, 5.0), 3)


def _mock_volume_24h():
    """Mock 24h volume."""
    return round(random.uniform(100, 5_000), 2)


def _mock_unique_holders():
    """Mock unique holders."""
    return random.randint(200, 5_000)


def _mock_wash_trading_ratio():
    """Mock wash trading ratio (0–1)."""
    return round(random.uniform(0.0, 0.4), 3)


def _mock_listing_ratio():
    """Mock listing ratio (listed / total)."""
    return round(random.uniform(0.05, 0.5), 3)


def compute_nft_intel():
    """
    NFT intelligence engine v1.
    Replace mocks with real API calls later.
    """

    floor = _mock_floor_price()
    vol_24h = _mock_volume_24h()
    holders = _mock_unique_holders()
    wash_ratio = _mock_wash_trading_ratio()
    listing_ratio = _mock_listing_ratio()

    floor_score = _norm(floor, 0.5, 5.0)
    vol_score = _norm(vol_24h, 100, 5_000)
    holder_score = _norm(holders, 200, 5_000)
    wash_score = 1 - wash_ratio          # lower wash = better
    listing_score = 1 - listing_ratio    # fewer listings = stronger conviction

    nft_score = (
        0.25 * floor_score +
        0.25 * vol_score +
        0.20 * holder_score +
        0.15 * wash_score +
        0.15 * listing_score
    )

    return {
        "timestamp": int(time.time()),
        "floor_price": floor,
        "volume_24h": vol_24h,
        "unique_holders": holders,
        "wash_trading_ratio": wash_ratio,
        "listing_ratio": listing_ratio,
        "scores": {
            "floor_score": round(floor_score, 3),
            "volume_score": round(vol_score, 3),
            "holder_score": round(holder_score, 3),
            "wash_score": round(wash_score, 3),
            "listing_score": round(listing_score, 3),
            "nft_score": round(nft_score, 3),
        }
    }
