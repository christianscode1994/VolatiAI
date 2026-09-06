from typing import Dict, Any

from src.intelligence.onchain_contracts import fused_contract_intelligence
from src.offchain.market_intelligence import market_intelligence


def pro_tier_contract_intelligence(token_address: str, chain: str = "ethereum") -> Dict[str, Any]:
    market = market_intelligence(token_address, chain=chain)
    onchain = fused_contract_intelligence(token_address, chain=chain)

    return {
        "address": token_address,
        "chain": chain,
        "market_layer": market,
        "onchain_layer": onchain,
    }
