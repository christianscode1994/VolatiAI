import requests
from typing import Dict, Any

RPC_URL = "https://rpc.polkadot.io"


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


def _runtime_version() -> Dict[str, Any]:
    data = _rpc("state_getRuntimeVersion")
    if "result" not in data:
        return {"spec_version": 0, "impl_version": 0}

    res = data["result"]
    return {
        "spec_version": res.get("specVersion", 0),
        "impl_version": res.get("implVersion", 0),
        "transaction_version": res.get("transactionVersion", 0),
    }


def _chain_info() -> Dict[str, Any]:
    chain = _rpc("system_chain")
    name = chain.get("result", "unknown")

    health = _rpc("system_health")
    peers = health.get("result", {}).get("peers", 0)
    is_syncing = health.get("result", {}).get("isSyncing", False)

    return {
        "chain_name": name,
        "peers": peers,
        "is_syncing": is_syncing,
    }


def _block_info() -> Dict[str, Any]:
    header = _rpc("chain_getHeader")
    if "result" not in header:
        return {"latest_block": 0}

    res = header["result"]
    number_hex = res.get("number", "0x0")
    latest_block = int(number_hex, 16)

    return {
        "latest_block": latest_block,
        "hash": res.get("hash"),
    }


def _governance_activity() -> Dict[str, Any]:
    """
    Placeholder governance activity.
    In a more advanced version, you'd query on-chain referendum/pallets or Subscan.
    """
    # For now, just return zeros; structure is ready for future expansion.
    return {
        "active_referenda": 0,
        "recent_proposals_24h": 0,
    }


def run() -> Dict[str, Any]:
    """
    Full Polkadot/Substrate developer intelligence module.
    """
    runtime = _runtime_version()
    chain = _chain_info()
    block = _block_info()
    gov = _governance_activity()

    # Simple ecosystem score
    spec_version = runtime.get("spec_version", 0)
    peers = chain.get("peers", 0)
    latest_block = block.get("latest_block", 0)

    score = 0.0
    score += min(0.4, spec_version / 10_000)
    score += min(0.3, peers / 100)
    score += min(0.3, latest_block / 5_000_000)

    return {
        "runtime": runtime,
        "chain": chain,
        "block": block,
        "governance": gov,
        "polkadot_score": round(min(score, 1.0), 3),
    }
