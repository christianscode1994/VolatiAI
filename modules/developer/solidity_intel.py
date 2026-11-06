import requests
from typing import Dict, Any

# Public Ethereum mainnet RPC (no key required)
RPC_URL = "https://cloudflare-eth.com"


def _rpc(method: str, params=None) -> Dict[str, Any]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or [],
    }
    try:
        r = requests.post(RPC_URL, json=payload, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def _latest_block() -> Dict[str, Any]:
    data = _rpc("eth_blockNumber")
    if "result" not in data:
        return {"latest_block": 0}

    block_hex = data["result"]
    latest_block = int(block_hex, 16)

    return {
        "latest_block": latest_block,
    }


def _block_stats(block_number: int) -> Dict[str, Any]:
    """
    Fetch a recent block and derive simple dev-relevant stats:
    - tx count
    - contract creation count
    """
    block_hex = hex(block_number)
    data = _rpc("eth_getBlockByNumber", [block_hex, True])
    if "result" not in data:
        return {"tx_count": 0, "contract_creations": 0}

    block = data["result"]
    txs = block.get("transactions", [])

    tx_count = len(txs)
    contract_creations = 0

    for tx in txs:
        # Contract creation tx has 'to' == None
        if tx.get("to") is None:
            contract_creations += 1

    return {
        "tx_count": tx_count,
        "contract_creations": contract_creations,
    }


def _gas_price() -> Dict[str, Any]:
    data = _rpc("eth_gasPrice")
    if "result" not in data:
        return {"gas_price_wei": 0}

    gas_hex = data["result"]
    gas_wei = int(gas_hex, 16)

    return {
        "gas_price_wei": gas_wei,
    }


def run() -> Dict[str, Any]:
    """
    Solidity/EVM developer intelligence module.
    Uses Ethereum mainnet as proxy for EVM dev activity.
    """
    latest = _latest_block()
    latest_block = latest.get("latest_block", 0)

    # Look at the latest block and a few blocks back
    stats_latest = _block_stats(latest_block) if latest_block > 0 else {"tx_count": 0, "contract_creations": 0}
    stats_prev = _block_stats(latest_block - 10) if latest_block > 10 else {"tx_count": 0, "contract_creations": 0}

    gas = _gas_price()

    # Simple ecosystem score
    tx_avg = (stats_latest["tx_count"] + stats_prev["tx_count"]) / 2
    contracts_avg = (stats_latest["contract_creations"] + stats_prev["contract_creations"]) / 2
    gas_wei = gas.get("gas_price_wei", 0)

    score = 0.0
    score += min(0.4, tx_avg / 500)                 # activity
    score += min(0.4, contracts_avg / 50)          # contract creation
    score += min(0.2, gas_wei / 200_000_000_000)   # gas environment

    return {
        "latest_block": latest_block,
        "block_stats_latest": stats_latest,
        "block_stats_prev": stats_prev,
        "gas": gas,
        "solidity_score": round(min(score, 1.0), 3),
    }
