"""
On-chain analytics:
- Chain health (Ethereum RPC)
- Stablecoin flows (Etherscan, ~24h window)
- Whale activity (Etherscan, stablecoin transfers >= $1M)
"""

import logging

from src.onchain.rpc import RPC
from src.tools_etherscan import summarize_stablecoin_flows, get_whale_transfers

logger = logging.getLogger("volatai.onchain")


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
    timestamp = (
        int(block.get("timestamp", "0"), 16)
        if isinstance(block.get("timestamp"), str)
        else block.get("timestamp")
    )

    return {
        "latest_block": latest_block,
        "gas_price": gas_price,
        "timestamp": timestamp,
        "tx_count": tx_count,
        "health_score": _score_chain_health(gas_price, tx_count),
    }


def _score_chain_health(gas_price, tx_count):
    score = 100
    if gas_price > 50_000_000_000:  # 50 gwei
        score -= 30
    if tx_count < 100:
        score -= 20
    return max(score, 0)


# ------------------------------------------------------------
# Stablecoin Flows — Etherscan, 24h window
# ------------------------------------------------------------

BLOCKS_PER_DAY_ETH = 7200  # ~12s/block on Ethereum mainnet


def build_stablecoin_flows(rpc: RPC, from_block: int, to_block: int):
    """
    Aggregate stablecoin transfer volume over the last ~24h using Etherscan.

    Note: `from_block` is accepted for compatibility but superseded —
    we use to_block - 7200 to guarantee a meaningful window.

    Falls back to zeros-with-error on failure (same JSON shape as before,
    so consumers won't break).
    """
    try:
        eth_from = max(0, to_block - BLOCKS_PER_DAY_ETH)
        flows = summarize_stablecoin_flows(eth_from, to_block, max_pages=2)
        return flows
    except Exception as e:
        logger.warning("Etherscan stablecoin flows failed: %s", e)
        return {
            "USDT": {"transfers": 0, "volume": 0.0, "error": str(e)[:80]},
            "USDC": {"transfers": 0, "volume": 0.0, "error": str(e)[:80]},
            "DAI":  {"transfers": 0, "volume": 0.0, "error": str(e)[:80]},
        }


# ------------------------------------------------------------
# Whale Activity — Etherscan, stablecoin transfers >= $1M
# ------------------------------------------------------------

def build_whale_activity(
    rpc: RPC, min_value_eth: float, from_block: int, to_block: int
):
    """
    Detect large stablecoin transfers (USDT/USDC/DAI >= $1M) over the last 24h.

    Note: `min_value_eth` is accepted for signature compatibility but is
    superseded by a fixed $1M USD threshold (stablecoins are 1:1 with USD).
    """
    try:
        eth_from = max(0, to_block - BLOCKS_PER_DAY_ETH)
        whales = get_whale_transfers(
            eth_from, to_block, min_usd=1_000_000, max_pages=2
        )
        return {
            "count": len(whales),
            "transfers": whales,
            "min_usd": 1_000_000,
        }
    except Exception as e:
        logger.warning("Etherscan whale activity failed: %s", e)
        return {"count": 0, "transfers": [], "error": str(e)[:80]}
