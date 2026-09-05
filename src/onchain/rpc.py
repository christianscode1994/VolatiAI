# src/onchain/rpc.py

import os
import requests

INFURA_URL = os.getenv("INFURA_URL")
ALCHEMY_URL = os.getenv("ALCHEMY_URL")
INFURA_GAS_URL = os.getenv("INFURA_GAS_URL")  # optional

HEADERS = {"Content-Type": "application/json"}

class RPC:
    """Unified RPC client for Infura + Alchemy."""

    def __init__(self):
        self.infura = INFURA_URL
        self.alchemy = ALCHEMY_URL
        self.gas = INFURA_GAS_URL

    def call(self, method: str, params=None, provider="infura"):
        """Generic RPC call."""
        if params is None:
            params = []

        if provider == "infura":
            url = self.infura
        elif provider == "alchemy":
            url = self.alchemy
        else:
            raise ValueError("Provider must be 'infura' or 'alchemy'")

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        }

        resp = requests.post(url, json=payload, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json()

    # -----------------------------
    # BASIC CHAIN METRICS
    # -----------------------------

    def get_block_number(self, provider="infura"):
        return int(self.call("eth_blockNumber", provider=provider)["result"], 16)

    def get_block(self, block_number: int, provider="infura"):
        hex_block = hex(block_number)
        return self.call("eth_getBlockByNumber", [hex_block, True], provider=provider)["result"]

    def get_gas_price(self, provider="infura"):
        return int(self.call("eth_gasPrice", provider=provider)["result"], 16)

    # -----------------------------
    # LOGS / EVENTS
    # -----------------------------

    def get_logs(self, address: str, topics=None, provider="infura"):
        params = [{
            "address": address,
            "topics": topics or []
        }]
        return self.call("eth_getLogs", params, provider=provider)["result"]

    # -----------------------------
    # CONTRACT CALLS
    # -----------------------------

    def call_contract(self, to: str, data: str, provider="infura"):
        params = [{
            "to": to,
            "data": data
        }]
        return self.call("eth_call", params, provider=provider)["result"]

    # -----------------------------
    # OPTIONAL GAS API
    # -----------------------------

    def get_fee_history(self, block_count=10, newest_block="latest", reward_percentiles=[5, 50, 95]):
        """Uses Infura Gas API if available."""
        if not self.gas:
            return None

        payload = {
            "jsonrpc": "2.0",
            "method": "eth_feeHistory",
            "params": [hex(block_count), newest_block, reward_percentiles],
            "id": 1
        }

        resp = requests.post(self.gas, json=payload, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json()["result"]
