import os
import json
import requests
from typing import Any, Dict, List, Optional

ETHERSCAN_KEY = os.getenv("ETHERSCAN_API_KEY")
BASE = "https://api.etherscan.io/api"


class EtherscanError(Exception):
    pass


def etherscan_get(params: Dict[str, Any]) -> Any:
    if not ETHERSCAN_KEY:
        raise EtherscanError("ETHERSCAN_API_KEY is missing from environment.")

    params["apikey"] = ETHERSCAN_KEY

    try:
        resp = requests.get(BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise EtherscanError(f"Etherscan request failed: {e}")

    status = data.get("status")
    message = data.get("message")

    if status == "0" and message != "OK":
        raise EtherscanError(f"Etherscan error: {message}")

    return data.get("result")


# -----------------------------
# ABI auto-decoding
# -----------------------------

def get_contract_abi_raw(address: str) -> str:
    return etherscan_get({
        "module": "contract",
        "action": "getabi",
        "address": address
    })


def decode_contract_abi(address: str) -> List[Dict[str, Any]]:
    abi_str = get_contract_abi_raw(address)
    try:
        return json.loads(abi_str)
    except json.JSONDecodeError as e:
        raise EtherscanError(f"Failed to decode ABI JSON: {e}")


# -----------------------------
# Contract metadata + verification
# -----------------------------

def get_contract_source(address: str) -> List[Dict[str, Any]]:
    return etherscan_get({
        "module": "contract",
        "action": "getsourcecode",
        "address": address
    })


def get_contract_metadata(address: str) -> Dict[str, Any]:
    result = get_contract_source(address)
    if not result:
        raise EtherscanError("Empty getsourcecode result.")

    meta = result[0]

    source_code = meta.get("SourceCode", "") or ""
    abi_field = meta.get("ABI", "") or ""

    is_verified = bool(source_code) and "Contract source code not verified" not in abi_field

    return {
        "address": address,
        "is_verified": is_verified,
        "contract_name": meta.get("ContractName"),
        "compiler_version": meta.get("CompilerVersion"),
        "compiler_type": meta.get("CompilerType"),
        "optimization_used": meta.get("OptimizationUsed"),
        "runs": meta.get("Runs"),
        "constructor_args": meta.get("ConstructorArguments"),
        "evm_version": meta.get("EVMVersion"),
        "license_type": meta.get("LicenseType"),
        "proxy": meta.get("Proxy") == "1",
        "implementation": meta.get("Implementation") or None,
        "source_code": source_code,
        "abi_raw": abi_field,
    }


# -----------------------------
# Token metrics + metadata snapshot
# -----------------------------

def get_token_supply(address: str) -> str:
    return etherscan_get({
        "module": "stats",
        "action": "tokensupply",
        "contractaddress": address
    })


def get_token_holders(address: str, page: int = 1, offset: int = 100) -> List[Dict[str, Any]]:
    return etherscan_get({
        "module": "token",
        "action": "tokenholderlist",
        "contractaddress": address,
        "page": page,
        "offset": offset
    })


def get_token_info(address: str) -> Optional[Dict[str, Any]]:
    result = etherscan_get({
        "module": "token",
        "action": "tokeninfo",
        "contractaddress": address
    })
    if not result:
        return None
    return result[0]


def get_token_metadata_snapshot(address: str) -> Dict[str, Any]:
    supply = get_token_supply(address)
    info = get_token_info(address)
    holders = get_token_holders(address, page=1, offset=100)

    return {
        "address": address,
        "total_supply": supply,
        "info": info,
        "top_holders": holders,
    }


# -----------------------------
# Internal txs + classification
# -----------------------------

def get_internal_txs(address: str, start_block: int = 0, end_block: int = 99999999) -> List[Dict[str, Any]]:
    return etherscan_get({
        "module": "account",
        "action": "txlistinternal",
        "address": address,
        "startblock": start_block,
        "endblock": end_block
    })


def classify_internal_tx(tx: Dict[str, Any]) -> str:
    value = int(tx.get("value", "0"))
    from_addr = tx.get("from")
    to_addr = tx.get("to")
    contract_addr = tx.get("contractAddress")
    is_error = tx.get("isError") == "1"

    if contract_addr and not is_error and from_addr and to_addr:
        if from_addr == contract_addr and value == 0:
            return "self_destruct"
        if to_addr == contract_addr and value == 0:
            return "contract_creation"

    if value > 0 and from_addr != to_addr:
        return "value_transfer"

    if not is_error and value == 0:
        return "refund"

    return "contract_call"


def classify_internal_txs(address: str, start_block: int = 0, end_block: int = 99999999) -> List[Dict[str, Any]]:
    txs = get_internal_txs(address, start_block, end_block)
    for tx in txs:
        tx["classification"] = classify_internal_tx(tx)
    return txs
