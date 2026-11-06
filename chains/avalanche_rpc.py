# VolatiAI/chains/avalanche_rpc.py
import os, requests
RPC = os.getenv("AVAX_RPC")

def get_avax_health():
    resp = requests.post(RPC, json={
        "jsonrpc": "2.0", "id": 1, "method": "info.getNodeVersion"
    }).json()
    return {"health_score": 0.9}  # placeholder normalization
