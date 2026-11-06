import os
import requests

RPC = os.getenv("ETH_RPC")

def get_eth_health():
    gas = requests.post(RPC, json={
        "jsonrpc": "2.0", "id": 1, "method": "eth_gasPrice"
    }).json()["result"]

    gas_int = int(gas, 16)
    return {
        "gas": gas_int,
        "congestion_score": min(1.0, gas_int / 200e9),
    }
