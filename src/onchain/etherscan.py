# src/onchain/etherscan.py

import os
import requests

ETHERSCAN_KEY = os.getenv("ETHERSCAN_API_KEY")
BASE = "https://api.etherscan.io/api"

def etherscan_get(params):
    params["apikey"] = ETHERSCAN_KEY
    resp = requests.get(BASE, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
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

def get_internal_txs(address: str, start_block=0, end_block=99999999):
    return etherscan_get({
        "module": "account",
        "action": "txlistinternal",
        "address": address,
        "startblock": start_block,
        "endblock": end_block
    })
