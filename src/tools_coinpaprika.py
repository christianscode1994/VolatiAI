# src/tools_coinpaprika.py

import requests
from typing import Any, Dict


BASE_URL = "https://api.coinpaprika.com/v1"


class CoinPaprika:
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()

    def _get(self, path: str, params: Dict[str, Any] | None = None) -> Any:
        url = f"{BASE_URL}{path}"
        resp = self.session.get(url, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def global_market(self) -> Dict[str, Any]:
        return self._get("/global")

    def ticker(self, coin_id: str) -> Dict[str, Any]:
        # Example: "btc-bitcoin"
        return self._get(f"/tickers/{coin_id}")
