# src/fusion/nft_score.py

from src.fusion.nft_unified import unified_nft

def score_nft(chain: str, identifier: str) -> dict:
    """
    identifier:
      - EVM: contract_address or (contract, token_id)
      - Solana: collection symbol or wallet
    """
    data = unified_nft(chain, identifier)

    # Simple example scoring – you can refine later
    stats = data.get("stats", {}) or {}
    listings = data.get("listings", []) or []
    activity = data.get("activity", []) or []

    floor = stats.get("floorPrice") or stats.get("floor_price") or 0
    listed_count = len(listings)
    trade_count = len(activity)

    score = (
        0.4 * normalize_floor(floor) +
        0.3 * normalize_liquidity(listed_count) +
        0.3 * normalize_activity(trade_count)
    )

    return {
        "chain": chain,
        "identifier": identifier,
        "floor": floor,
        "listed_count": listed_count,
        "trade_count": trade_count,
        "score": score,
    }


def normalize_floor(floor: float) -> float:
    return min(1.0, max(0.0, floor / 10.0))


def normalize_liquidity(n: int) -> float:
    return min(1.0, max(0.0, n / 100.0))


def normalize_activity(n: int) -> float:
    return min(1.0, max(0.0, n / 200.0))
