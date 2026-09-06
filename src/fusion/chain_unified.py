# from src.chains.evm.health import get_evm_chain_health
# from src.chains.solana.health import get_solana_chain_health

def unified_chain(chain: str) -> dict:
    if chain in ("ethereum", "polygon", "base", "arbitrum", "optimism"):
        return {
            "tps": None,
            "fees": None,
            "congestion": None,
            "finality": None,
        }

    if chain == "solana":
        return {
            "tps": None,
            "fees": None,
            "congestion": None,
            "finality": None,
        }

    return {}
