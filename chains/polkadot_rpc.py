import os
import requests

RPC = os.getenv("DOT_RPC")

def get_dot_health():
    resp = requests.post(RPC, json={
        "jsonrpc": "2.0", "id": 1, "method": "system_health"
    }).json()["result"]

    return {
        "is_syncing": resp["isSyncing"],
        "peers": resp["peers"],
        "health_score": 1.0 if not resp["isSyncing"] and resp["peers"] > 10 else 0.5,
    }
