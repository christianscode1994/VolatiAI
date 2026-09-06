from src.fusion.token_unified import unified_token
from src.fusion.market_unified import unified_market
from src.fusion.chain_unified import unified_chain

def norm(x, max_val):
    if x is None:
        return 0.0
    return min(1.0, max(0.0, x / max_val))

def safe_len(x):
    return len(x) if isinstance(x, (list, tuple)) else 0

def token_score(chain: str, identifier: str) -> dict:
    token = unified_token(chain, identifier)
    market = unified_market(identifier)
    chain_state = unified_chain(chain)

    info = token.get("info") or {}
    transfers = token.get("transfers") or []
    holders = token.get("holders") or {}

    liquidity_score = norm(safe_len(transfers), 500)
    holder_score = norm(len(holders), 10000)
    chain_health_score = 0.5  # placeholder, reuse chain scoring later
    market_depth_score = 0.5  # placeholder

    final = (
        0.3 * liquidity_score +
        0.3 * holder_score +
        0.2 * chain_health_score +
        0.2 * market_depth_score
    )

    return {
        "liquidity_score": liquidity_score,
        "holder_score": holder_score,
        "chain_health_score": chain_health_score,
        "market_depth_score": market_depth_score,
        "final_score": final,
        "info": info,
    }
