# src/onchain/intelligence.py

"""
VolatiAI On‑Chain Intelligence Module
-------------------------------------

Lightweight analytics for:
- Chain health
- Stablecoin flows
- Whale activity

Compatible with src/onchain/rpc.py
"""

from src.onchain.rpc import RPC


# ------------------------------------------------------------
# Chain Health
# ------------------------------------------------------------

def build_chain_health(rpc: RPC):
    """
    Compute basic chain health metrics using RPC:
    - latest block
    - gas price
    - tx count
    - timestamp
    """

    latest_block = rpc.get_block_number()
    block = rpc.get_block(latest_block)
    gas_price = rpc.get_gas_price()

    tx_count = len(block.get("transactions", []))
    timestamp = int(block.get("timestamp", "0"), 16) if isinstance(block.get("timestamp"), str) else block.get("timestamp")

    return {
        "latest_block": latest_block,
        "gas_price": gas_price,
        "timestamp": timestamp,
        "tx_count": tx_count,
        "health_score": _score_chain_health(gas_price, tx_count)
    }


def _score_chain_health(gas_price, tx_count):
    """
    Simple heuristic scoring:
    - low gas + moderate tx count → healthy
    - high gas + low tx count → stressed
    """

    score = 100

    if gas_price > 50_000_000_000:  # 50 gwei
        score -= 30

    if tx_count < 100:
        score -= 20

    return max(score, 0)


# ------------------------------------------------------------
# Stablecoin Flows
# ------------------------------------------------------------

def build_stablecoin_flows(rpc: RPC, from_block: int, to_block: int):
    """
    Aggregate stablecoin transfer volume between two blocks.
    Uses eth_getLogs for ERC‑20 Transfer events.
    """

    tokens = {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI":  "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    }

    flows = {}

    transfer_topic = "0xddf252ad"  # ERC‑20 Transfer event signature prefix

    for symbol, address in tokens.items():
        logs = rpc.get_logs(
            address=address,
            from_block=from_block,
            to_block=to_block,
            topics=[transfer_topic],
            provider="infura"
        )

        flows[symbol] = {
            "transfers": len(logs),
            "volume": sum(int(log.get("data", "0x0"), 16) for log in logs)
        }

    return flows


# ------------------------------------------------------------
# Whale Activity
# ------------------------------------------------------------

def build_whale_activity(rpc: RPC, min_value_eth: float, from_block: int, to_block: int):
    """
    Detect large ETH transfers using eth_getLogs.
    """

    transfer_topic = "0xddf252ad"  # ERC‑20 Transfer signature

    logs = rpc.get_logs(
        address=None,
        from_block=from_block,
        to_block=to_block,
        topics=[transfer_topic],
        provider="infura"
    )

    threshold = int(min_value_eth * 10**18)

    whales = [
        log for log in logs
        if int(log.get("data", "0x0"), 16) >= threshold
    ]

    return {
        "count": len(whales),
        "transfers": whales
    }
