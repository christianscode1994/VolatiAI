# src/onchain/etherscan.py

import os
import requests

ETHERSCAN_KEY = os.getenv("ETHERSCAN_API_KEY")
BASE = "https://api.etherscan.io/api"

class EtherscanError(Exception):
    pass

def etherscan_get(params: dict):
    """Generic Etherscan GET wrapper with proper error handling."""
    if not ETHERSCAN_KEY:
        raise EtherscanError("ETHERSCAN_API_KEY is missing from environment.")

    params["apikey"] = ETHERSCAN_KEY

    try:
        resp = requests.get(BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise EtherscanError(f"Etherscan request failed: {e}")

    # Etherscan returns status + message fields
    status = data.get("status")
    message = data.get("message")

    if status == "0" and message != "OK":
        # Etherscan error (e.g., invalid address, rate limit, etc.)
        raise EtherscanError(f"Etherscan error: {message}")

    return data.get("result")

# -----------------------------
# CONTRACT METADATA
# -----------------------------

def get_contract_source(address: str):
    return etherscan_get({
        "module": "contract",
        "action": "getsourcecode",
        "address": address
    })

def get_contract_abi(address: str):
    return etherscan_get({
        "module": "contract",
        "action": "getabi",
        "address": address
    })

# -----------------------------
# TOKEN METRICS
# -----------------------------

def get_token_supply(address: str):
    return etherscan_get({
        "module": "stats",
        "action": "tokensupply",
        "contractaddress": address
    })

def get_token_holders(address: str):
    return etherscan_get({
        "module": "token",
        "action": "tokenholderlist",
        "contractaddress": address
    })

# -----------------------------
# INTERNAL TRANSACTIONS
# -----------------------------

def get_internal_txs(address: str, start_block: int = 0, end_block: int = 99999999):
    return etherscan_get({
        "module": "account",
        "action": "txlistinternal",
        "address": address,
        "startblock": start_block,
        "endblock": end_block
    })
