import requests
from typing import Dict, Any

RPC_URL = "https://api.mainnet-beta.solana.com"


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


def _validator_health() -> Dict[str, Any]:
    data = _rpc("getVoteAccounts")
    if "result" not in data:
        return {"validator_health": 0.0, "delinquent_ratio": 0.0}

    current = data["result"].get("current", [])
    delinquent = data["result"].get("delinquent", [])

    total = len(current) + len(delinquent)
    if total == 0:
        return {"validator_health": 0.0, "delinquent_ratio": 0.0}

    delinquent_ratio = len(delinquent) / total
    health = 1.0 - delinquent_ratio

    return {
        "validator_health": round(health, 3),
        "delinquent_ratio": round(delinquent_ratio, 3),
        "validators_total": total,
    }


def _epoch_info() -> Dict[str, Any]:
    data = _rpc("getEpochInfo")
    if "result" not in data:
        return {}

    result = data["result"]
    return {
        "epoch": result.get("epoch", 0),
        "slot_index": result.get("slotIndex", 0),
        "slots_in_epoch": result.get("slotsInEpoch", 0),
        "transaction_count": result.get("transactionCount", 0),
    }


def _program_deployments() -> Dict[str, Any]:
    """
    Count how many programs exist. This is a proxy for deployment activity.
    """
    data = _rpc("getProgramAccounts", ["BPFLoaderUpgradeab1e11111111111111111111111"])
    if "result" not in data:
        return {"program_count": 0}

    program_count = len(data["result"])
    return {"program_count": program_count}


def _cluster_nodes() -> Dict[str, Any]:
    data = _rpc("getClusterNodes")
    if "result" not in data:
        return {"node_count": 0}

    nodes = data["result"]
    return {
        "node_count": len(nodes),
        "nodes": nodes[:10],  # limit for readability
    }


def run() -> Dict[str, Any]:
    """
    Full Solana developer intelligence module.
    """
    validators = _validator_health()
    epoch = _epoch_info()
    programs = _program_deployments()
    nodes = _cluster_nodes()

    # Simple ecosystem score
    score = (
        0.4 * validators.get("validator_health", 0.0) +
        0.2 * (programs.get("program_count", 0) / 20000) +
        0.2 * (nodes.get("node_count", 0) / 2000) +
        0.2 * (epoch.get("transaction_count", 0) / 100000000)
    )

    return {
        "validators": validators,
        "epoch": epoch,
        "programs": programs,
        "nodes": nodes,
        "solana_score": round(min(score, 1.0), 3),
    }
