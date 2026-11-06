# src/onchain/intelligence.py

from .rpc import RPC
import statistics
import time

def build_chain_health(rpc: RPC, blocks_back: int = 20):
    """
    High-level chain health:
    - latest block
    - avg block time
    - gas price
    - fee history (if gas API available)
    """

    latest = rpc.get_block_number()
    timestamps = []

    # collect timestamps for last N blocks
    for i in range(blocks_back):
        bn = latest - i
        block = rpc.get_block(bn)
        ts = int(block["timestamp"], 16)
        timestamps.append(ts)

    timestamps = list(reversed(timestamps))
    deltas = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
    avg_block_time = statistics.mean(deltas) if deltas else None
    std_block_time = statistics.pstdev(deltas) if len(deltas) > 1 else None

    gas_price = rpc.get_gas_price()
    fee_hist = rpc.get_fee_history()  # may be None if INFURA_GAS_URL not set

    return {
        "latest_block": latest,
        "avg_block_time_sec": avg_block_time,
        "block_time_volatility_sec": std_block_time,
        "gas_price_wei": gas_price,
        "fee_history": fee_hist,
    }


def build_stablecoin_flows(rpc: RPC, from_block: int, to_block: int):
    """
    Simple stablecoin transfer activity using logs:
    - USDC, USDT, DAI transfer counts
    """

    # mainnet contract addresses (ERC-20)
    usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
    dai  = "0x6B175474E89094C44Da98b954EedeAC495271d0F"

    # Transfer topic
    transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

    def count_transfers(address):
        logs = rpc.get_logs(
            address=address,
            topics=[transfer_topic]
        )
        # filter by block range
        return sum(
            1 for log in logs
            if from_block <= int(log["blockNumber"], 16) <= to_block
        )

    usdc_count = count_transfers(usdc)
    usdt_count = count_transfers(usdt)
    dai_count  = count_transfers(dai)

    return {
        "from_block": from_block,
        "to_block": to_block,
        "usdc_transfers": usdc_count,
        "usdt_transfers": usdt_count,
        "dai_transfers": dai_count,
    }


def build_whale_activity(rpc: RPC, min_value_eth: float, from_block: int, to_block: int):
    """
    Very simple whale detector:
    - scans blocks for large ETH transfers (value >= min_value_eth)
    """

    whales = []
    for bn in range(from_block, to_block + 1):
        block = rpc.get_block(bn)
        for tx in block["transactions"]:
            value_wei = int(tx["value"], 16)
            value_eth = value_wei / 10**18
            if value_eth >= min_value_eth:
                whales.append({
                    "block_number": bn,
                    "hash": tx["hash"],
                    "from": tx["from"],
                    "to": tx.get("to"),
                    "value_eth": value_eth,
                })

    return {
        "from_block": from_block,
        "to_block": to_block,
        "min_value_eth": min_value_eth,
        "large_transfers": whales,
    }
