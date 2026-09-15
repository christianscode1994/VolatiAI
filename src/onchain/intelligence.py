# src/onchain/intelligence.py

"""
VolatiAI On‑Chain Intelligence Module
-------------------------------------

This module provides lightweight, dependency‑free analytics for:
- Chain health
- Stablecoin flows
- Whale activity

It integrates with src/onchain/rpc.py and is designed for serverless
execution inside GitHub Actions.
"""

from src.onchain.rpc import RPC


# ------------------------------------------------------------
# Chain Health
# ------------------------------------------------------------

def build_chain_health(rpc: RPC):
    """
    Compute basic chain health metrics:
    - latest block
    - gas price
    - base fee
    - pending tx count
    """

    latest_block = rpc.block_number()
    gas_price = rpc.gas_price()
    base_fee = rpc.base_fee()
    pending = rpc.pending_tx_count()

    return {
        "latest_block": latest_block,
        "gas_price": gas_price,
        "base_fee": base_fee,
        "pending_tx": pending,
        "health_score": _score_chain_health(gas_price, base_fee, pending)
    }


def _score_chain_health(gas_price, base_fee, pending):
    """
    Simple heuristic scoring:
    - low gas + low pending → healthy
    - high gas + high pending → stressed
    """

    score = 100

    if gas_price > 50_000_000_000:  # 50 gwei
        score -= 20

    if base_fee > 60_000_000_000:  # 60 gwei
        score -= 20

    if pending > 150_000:
        score -= 40

    return max(score, 0)


# ------------------------------------------------------------
# Stablecoin Flows
# ------------------------------------------------------------

def build_stablecoin_flows(rpc: RPC, from_block: int, to_block: int):
    """
    Aggregate stablecoin transfer volume between two blocks.
    Uses ERC‑20 Transfer logs for USDT, USDC, DAI.
    """

    tokens = {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI":  "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    }

    flows = {}

    for symbol, address in tokens.items():
        logs = rpc.erc20_transfers(address, from_block, to_block)
        total = sum(log["value"] for log in logs)
        flows[symbol] = {
            "transfers": len(logs),
            "volume": total
        }

    return flows


# ------------------------------------------------------------
# Whale Activity
# ------------------------------------------------------------

def build_whale_activity(rpc: RPC, min_value_eth: float, from_block: int, to_block: int):
    """
    Detect large ETH transfers between two blocks.
    """

    logs = rpc.eth_transfers(from_block, to_block)
    threshold = int(min_value_eth * 10**18)

    whales = [
        tx for tx in logs
        if tx["value"] >= threshold
    ]

    return {
        "count": len(whales),
        "transfers": whales
    }
