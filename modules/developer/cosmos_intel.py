import requests
from typing import Dict, Any

LCD_URL = "https://api.cosmos.network"


def _get(path: str) -> Dict[str, Any]:
    try:
        r = requests.get(LCD_URL + path, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


# ------------------------------------------------------------
# Governance Activity (developer signal: chain evolution)
# ------------------------------------------------------------
def _governance_activity() -> Dict[str, Any]:
    data = _get("/cosmos/gov/v1beta1/proposals")
    proposals = data.get("proposals", [])

    active = [
        p for p in proposals
        if p.get("status") == "PROPOSAL_STATUS_VOTING_PERIOD"
    ]

    return {
        "total_proposals": len(proposals),
        "active_proposals": len(active),
    }


# ------------------------------------------------------------
# Latest Block (developer signal: chain liveness)
# ------------------------------------------------------------
def _latest_block() -> Dict[str, Any]:
    data = _get("/cosmos/base/tendermint/v1beta1/blocks/latest")
    block = data.get("block", {})

    header = block.get("header", {})
    height = int(header.get("height", 0))

    return {
        "latest_block": height,
        "chain_id": header.get("chain_id"),
        "time": header.get("time"),
    }


# ------------------------------------------------------------
# Node Info (developer signal: network metadata)
# ------------------------------------------------------------
def _node_info() -> Dict[str, Any]:
    data = _get("/cosmos/base/tendermint/v1beta1/node_info")
    node = data.get("default_node_info", {})

    return {
        "protocol_version": node.get("protocol_version", {}),
        "network": node.get("network"),
        "moniker": node.get("moniker"),
    }


# ------------------------------------------------------------
# Validator Set (developer signal: decentralization)
# ------------------------------------------------------------
def _validators() -> Dict[str, Any]:
    data = _get("/cosmos/staking/v1beta1/validators")
    validators = data.get("validators", [])

    bonded = [
        v for v in validators
        if v.get("status") == "BOND_STATUS_BONDED"
    ]

    return {
        "validator_count": len(validators),
        "bonded_count": len(bonded),
    }


# ------------------------------------------------------------
# Supply Info (developer signal: chain economics)
# ------------------------------------------------------------
def _supply() -> Dict[str, Any]:
    data = _get("/cosmos/bank/v1beta1/supply")
    supply = data.get("supply", [])

    return {
        "denoms": len(supply),
        "supply": supply[:10],  # limit for readability
    }


# ------------------------------------------------------------
# Main run() entry point
# ------------------------------------------------------------
def run() -> Dict[str, Any]:
    gov = _governance_activity()
    block = _latest_block()
    node = _node_info()
    validators = _validators()
    supply = _supply()

    # Developer ecosystem scoring
    active_proposals = gov.get("active_proposals", 0)
    latest_block = block.get("latest_block", 0)
    validator_count = validators.get("validator_count", 0)

    score = 0.0
    score += min(0.3, active_proposals * 0.05)         # governance activity
    score += min(0.4, latest_block / 10_000_000)       # chain liveness
    score += min(0.3, validator_count / 500)           # decentralization

    return {
        "governance": gov,
        "block": block,
        "node": node,
        "validators": validators,
        "supply": supply,
        "cosmos_score": round(min(score, 1.0), 3),
    }
