# VolatiAI/chains/solana_rpc.py
import requests
import os

def get_solana_slot():
    url = os.getenv("SOLANA_RPC")
    payload = {"jsonrpc": "2.0", "id": 1, "method": "getSlot"}
    return requests.post(url, json=payload).json()["result"]
