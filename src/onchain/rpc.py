# src/onchain/rpc.py

import os
import requests

HEADERS = {"Content-Type": "application/json"}

# Existing secrets (you already have these)
INFURA_URL = os.getenv("INFURA_URL")
ALCHEMY_URL = os.getenv("ALCHEMY_URL")
INFURA_GAS_URL = os.getenv("INFURA_GAS_URL")

# New public RPCs (recommended to store in GitHub Secrets)
PUBLIC_RPC = {
    "ethereum": os.getenv("PUBLIC_ETH_RPC"),
    "polygon": os.getenv("PUBLIC_POLYGON_RPC"),
    "bsc": os.getenv("PUBLIC_BSC_RPC"),
    "avalanche": os.getenv("PUBLIC_AVAX_RPC"),
    "solana": os.getenv("PUBLIC_SOLANA_RPC"),
}

class RPC:
    """
    Unified RPC client:
    - Infura
    - Alchemy
    - Public RPC fallback
    - Multi-chain routing
    """

    def __init__(self):
        self.infura = INFURA_URL
        self.alchemy = ALCHEMY_URL
        self.gas = INFURA_GAS_URL

    # -----------------------------
    # Core RPC call
    # -----------------------------
    def call(self, method: str, params=None, provider="infura"):
        if params is None:
            params = []

        # Provider selection
        if provider == "infura":
            url = self.infura
        elif provider == "alchemy":
            url = self.alchemy
        elif provider in PUBLIC_RPC:
            url = PUBLIC_RPC[provider]
        else:
            raise ValueError(f"Unknown provider: {provider}")

        if not url:
            raise ValueError(f"RPC URL missing for provider: {provider}")

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
    # Multi-chain routing
    # -----------------------------
    def chain_call(self, chain: str, method: str, params=None):
        """
        Automatically selects the correct RPC for the chain.
        Falls back to public RPC if Infura/Alchemy unavailable.
        """
        chain = chain.lower()

        # Ethereum → use Infura/Alchemy first
        if chain == "ethereum":
            try:
                return self.call(method, params, provider="infura")
            except:
                return self.call(method, params, provider="alchemy")

        # Other chains → use public RPC
        if chain in PUBLIC_RPC:
            return self.call(method, params, provider=chain)

        raise ValueError(f"Unsupported chain: {chain}")

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
