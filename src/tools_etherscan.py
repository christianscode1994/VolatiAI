# src/tools_etherscan.py

import os
import requests
from typing import Any, Dict, List


BASE_URL = "https://api.etherscan.io/api"


class Etherscan:
    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self.api_key = api_key or os.getenv("ETHERSCAN_API_KEY", "")
        self.session = session or requests.Session()

    def _get(self, params: Dict[str, Any]) -> Any:
        base_params = {"apikey": self.api_key} if self.api_key else {}
        resp = self.session.get(BASE_URL, params={**params, **base_params}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "0" and data.get("message") != "No transactions found":
            raise RuntimeError(f"Etherscan error: {data.get('result')}")
        return data["result"]

    def tx_summary(self, address: str | None = None, start_block: int = 0, end_block: int = 99999999) -> Dict[str, Any]:
        # If no address given, you can plug in a default hot wallet or treasury later.
        if not address:
            return {"address": None, "tx_count": 0, "volume_wei": 0}

        txs: List[Dict[str, Any]] = self._get({
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": start_block,
            "endblock": end_block,
            "sort": "desc",
        })

        tx_count = len(txs)
        volume_wei = sum(int(tx["value"]) for tx in txs) if txs else 0

        return {
            "address": address,
            "tx_count": tx_count,
            "volume_wei": volume_wei,
        }
