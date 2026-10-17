# src/tools_etherscan.py

import os
import time
from typing import List, Dict, Optional

import requests


ETHERSCAN_API = "https://api.etherscan.io/v2/api"

STABLECOIN_CONTRACTS = {
    "USDT": {"address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "decimals": 6},
    "USDC": {"address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
    "DAI":  {"address": "0x6B175474E89094C44Da98b954EedeAC495271d0F", "decimals": 18},
}


def _api_key() -> str:
    key = os.getenv("ETHERSCAN_API_KEY")
    if not key:
        raise RuntimeError("ETHERSCAN_API_KEY not set")
    return key


def _get(action: str, params: dict, retries: int = 3) -> List[dict]:
    full = dict(params)
    full["chainid"] = 1  # Ethereum mainnet (required by V2)
    full["module"] = "account"
    full["action"] = action
    full["apikey"] = _api_key()

    for attempt in range(retries):
        try:
            r = requests.get(ETHERSCAN_API, params=full, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            body = r.json()
            status = str(body.get("status", ""))
            message = str(body.get("message", ""))
            if status == "1":
                return body.get("result", [])
            if "No transactions found" in message or "No records found" in message:
                import logging
                logging.getLogger("volatai.etherscan").info(
                    "Etherscan: no transactions for contract=%s range=[%s,%s]",
                    params.get("contractaddress"), params.get("startblock"), params.get("endblock")
                )
                return []
            raise RuntimeError(f"Etherscan error: {message} ({body.get('result')})")
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return []


def get_token_transfers_page(contract: str, from_block: int, to_block: int,
                             page: int = 1, offset: int = 100) -> List[dict]:
    return _get("tokentx", {
        "contractaddress": contract,
        "startblock": from_block,
        "endblock": to_block,
        "page": page,
        "offset": offset,
        "sort": "desc",
    })


def get_token_transfers(contract: str, from_block: int, to_block: int,
                        max_pages: int = 20) -> List[dict]:
    all_transfers: List[dict] = []
    for page in range(1, max_pages + 1):
        try:
            batch = get_token_transfers_page(contract, from_block, to_block, page=page)
        except Exception:
            if page == 1:
                raise  # first page failed — propagate so caller knows
            break      # subsequent pages failing is OK (we have earlier data)
        if not batch:
            break
        all_transfers.extend(batch)
        # Page size is 100 (see get_token_transfers_page offset)
        if len(batch) < 100:
            break
        time.sleep(0.25)
    return all_transfers


def summarize_stablecoin_flows(from_block: int, to_block: int,
                                max_pages: int = 20) -> Dict[str, dict]:
    result: Dict[str, dict] = {}
    for symbol, meta in STABLECOIN_CONTRACTS.items():
        try:
            transfers = get_token_transfers(
                meta["address"], from_block, to_block, max_pages=max_pages
            )
            volume = 0.0
            for t in transfers:
                try:
                    volume += float(t.get("value", "0")) / (10 ** meta["decimals"])
                except (ValueError, TypeError):
                    continue
            result[symbol] = {
                "transfers": len(transfers),
                "volume": round(volume, 2),
                "sampled": len(transfers) >= max_pages * 100,
                "sample_window": f"{len(transfers)} most recent transfers",
            }
        except Exception as e:
            result[symbol] = {"transfers": 0, "volume": 0.0, "error": str(e)[:80]}
    return result


def get_whale_transfers(from_block: int, to_block: int,
                         min_usd: float = 1_000_000.0,
                         max_pages: int = 20) -> List[dict]:
    whales: List[dict] = []
    for symbol, meta in STABLECOIN_CONTRACTS.items():
        try:
            transfers = get_token_transfers(
                meta["address"], from_block, to_block, max_pages=max_pages
            )
        except Exception:
            continue
        for t in transfers:
            try:
                amount = float(t.get("value", "0")) / (10 ** meta["decimals"])
            except (ValueError, TypeError):
                continue
            if amount < min_usd:
                continue
            whales.append({
                "hash": t.get("hash"),
                "from": t.get("from"),
                "to": t.get("to"),
                "token": symbol,
                "value": round(amount, 2),
                "timestamp": int(t.get("timeStamp", "0")),
                "block": int(t.get("blockNumber", "0")),
            })
    # Dedupe by (hash, from, to, value) — pagination can return the same
    # transfer event twice, but a batch tx can legitimately have multiple
    # Transfer events with the same hash and different to/from
    seen = set()
    unique_whales = []
    for w in whales:
        key = (w.get("hash"), w.get("from"), w.get("to"), w.get("value"))
        if key[0] is None or key in seen:
            continue
        seen.add(key)
        unique_whales.append(w)

    unique_whales.sort(key=lambda x: x["value"], reverse=True)
    return unique_whales[:50]
