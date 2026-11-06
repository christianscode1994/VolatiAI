import requests
from typing import Optional


POLKADOT_RPC_URLS = [
    "https://rpc.ibp.network/polkadot",
    "https://polkadot.dotters.network",
    "https://polkadot.api.onfinality.io/public",
]


def _rpc_call(method: str, params: Optional[list] = None, timeout: int = 10) -> Optional[dict]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    for url in POLKADOT_RPC_URLS:
        try:
            r = requests.post(
                url,
                json=payload,
                timeout=timeout,
                headers={"Content-Type": "application/json"},
            )
            if r.status_code == 200:
                data = r.json()
                if "result" in data:
                    return data["result"]
        except Exception:
            continue
    return None


def get_polkadot_health() -> dict:
    header = _rpc_call("chain_getHeader")
    finalized = _rpc_call("chain_getFinalizedHead")
    health = _rpc_call("system_health")

    if not header:
        return {"status": "unavailable", "health_score": 0}

    latest_block = int(header.get("number", "0x0"), 16)
    peers = (health or {}).get("peers", 0)
    is_syncing = (health or {}).get("isSyncing", True)

    health_score = 100
    if is_syncing:
        health_score = 30
    if peers < 10:
        health_score = min(health_score, 50)
    if not finalized:
        health_score = min(health_score, 70)

    return {
        "latest_block": latest_block,
        "finalized": bool(finalized),
        "peers": peers,
        "is_syncing": is_syncing,
        "block_time_sec": 6.0,
        "health_score": health_score,
    }
