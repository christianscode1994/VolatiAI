import math
import statistics

# Fusion layer imports
from src.fusion.nft_unified import unified_nft
from src.fusion.market_unified import unified_market
from src.fusion.chain_unified import unified_chain


# -----------------------------
# Normalization helpers
# -----------------------------

def norm(x, max_val):
    if x is None:
        return 0.0
    return min(1.0, max(0.0, x / max_val))


def safe_len(x):
    return len(x) if isinstance(x, (list, tuple)) else 0


# -----------------------------
# Individual scoring components
# -----------------------------

def score_floor_price(floor):
    return norm(floor, 10.0)


def score_liquidity(listings):
    return norm(safe_len(listings), 200)


def score_activity(activity):
    return norm(safe_len(activity), 300)


def score_rarity(metadata):
    if not metadata:
        return 0.0
    # placeholder rarity scoring
    return 0.5


def score_holder_distribution(wallet_tokens):
    if not wallet_tokens:
        return 0.0
    # placeholder distribution scoring
    return 0.5


def score_chain_health(chain_state):
    if not chain_state:
        return 0.0
    tps = chain_state.get("tps", 0)
    congestion = chain_state.get("congestion", 0)
    finality = chain_state.get("finality", 0)

    return (
        0.4 * norm(tps, 5000) +
        0.3 * (1 - congestion) +
        0.3 * finality
    )


def score_market_depth(market_state):
    if not market_state:
        return 0.0
    # placeholder depth scoring
    return 0.5


def score_volatility(activity):
    prices = []
    for evt in activity or []:
        p = evt.get("price") or evt.get("sale_price")
        if p:
            prices.append(float(p))

    if len(prices) < 2:
        return 0.0

    mean = statistics.mean(prices)
    stdev = statistics.pstdev(prices)
    vol = stdev / mean if mean > 0 else 0.0

    # invert volatility (lower vol = higher score)
    return max(0.0, 1.0 - norm(vol, 1.0))


# -----------------------------
# Main scoring engine
# -----------------------------

def nft_score(chain: str, identifier: str) -> dict:
    """
    Offline-compatible NFT scoring engine.
    Works with snapshots or live fusion data.
    """

    nft = unified_nft(chain, identifier)
    market = unified_market(identifier)
    chain_state = unified_chain(chain)

    floor = nft.get("stats", {}).get("floorPrice") or 0
    listings = nft.get("listings", [])
    activity = nft.get("activity", [])
    metadata = nft.get("metadata")
    wallet_tokens = nft.get("wallet")

    score = {
        "floor_score": score_floor_price(floor),
        "liquidity_score": score_liquidity(listings),
        "activity_score": score_activity(activity),
        "rarity_score": score_rarity(metadata),
        "holder_distribution_score": score_holder_distribution(wallet_tokens),
        "chain_health_score": score_chain_health(chain_state),
        "market_depth_score": score_market_depth(market),
        "volatility_score": score_volatility(activity),
    }

    # Weighted final score
    final = (
        0.20 * score["floor_score"] +
        0.15 * score["liquidity_score"] +
        0.15 * score["activity_score"] +
        0.10 * score["rarity_score"] +
        0.10 * score["holder_distribution_score"] +
        0.10 * score["chain_health_score"] +
        0.10 * score["market_depth_score"] +
        0.10 * score["volatility_score"]
    )

    score["final_score"] = final

    return score
