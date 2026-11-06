from src.offchain.dexscreener import get_pairs_by_token
from src.offchain.defillama import get_token_tvl

def market_intelligence(token_address: str, chain="ethereum"):
    """
    Unified market + macro snapshot.
    """
    return {
        "dexscreener_pairs": get_pairs_by_token(token_address),
        "defillama_tvl": get_token_tvl(token_address, chain),
    }
