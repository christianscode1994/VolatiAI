# src/onchain/rpc.py

import os
import requests

HEADERS = {"Content-Type": "application/json"}

# Existing secrets (sanitized)
INFURA_URL = (os.getenv("INFURA_URL") or "").strip()
ALCHEMY_URL = (os.getenv("ALCHEMY_URL") or "").strip()
INFURA_GAS_URL = (os.getenv("INFURA_GAS_URL") or "").strip()

# Public RPCs (sanitized)
PUBLIC_RPC = {
    "ethereum": (os.getenv("PUBLIC_ETH_RPC") or "").strip(),
    "polygon": (os.getenv("PUBLIC_POLYGON_RPC") or "").strip(),
    "bsc": (os.getenv("PUBLIC_BSC_RPC") or "").strip(),
    "avalanche": (os.getenv("PUBLIC_AVAX_RPC") or "").strip(),
    "solana": (os.getenv("PUBLIC_SOLANA_RPC") or "").strip(),
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
        # sanitize all URLs to avoid %0A newline issues
        self.infura = (INFURA_URL or "").strip()
        self.alchemy = (ALCHEMY_URL or "").strip()
        self.gas = (INFURA_GAS_URL or "").strip()

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

        # Final safety strip
        url = (url or "").strip()

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
        chain = chain.lower()

        # Ethereum → Infura → Alchemy fallback
        if chain == "ethereum":
            try:
                return self.call(method, params, provider="infura")
            except:
                return self.call(method, params, provider="alchemy")

        # Other chains → public RPC
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
    def get_logs(self, address: str, from_block: int, to_block: int, topics=None, provider="infura"):
        params = [{
            "fromBlock": hex(from_block),
            "toBlock": hex(to_block),
            "address": address,
            "topics": topics or []
        }]
        # Prevent KeyError: 'result'
        return self.call("eth_getLogs", params, provider=provider).get("result", [])

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
