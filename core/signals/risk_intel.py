from chains.solana_rpc import get_solana_health
from chains.ethereum_rpc import get_eth_health
from chains.polkadot_rpc import get_dot_health

def build_chain_risk_score():
    sol = get_solana_health()
    eth = get_eth_health()
    dot = get_dot_health()

    # toy fusion: average of health/congestion
    components = [
        sol["health_score"],
        1.0 - eth["congestion_score"],
        dot["health_score"],
    ]

    return sum(components) / len(components)
