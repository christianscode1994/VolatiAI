# src/tools_kraken.py

import requests
from typing import Any, Dict


BASE_URL = "https://api.kraken.com/0/public"


class Kraken:
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()

    def _get(self, path: str, params: Dict[str, Any] | None = None) -> Any:
        url = f"{BASE_URL}{path}"
        resp = self.session.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("error"):
            raise RuntimeError(f"Kraken error: {data['error']}")
        return data["result"]

    def ticker(self, pair: str) -> Dict[str, Any]:
        # Example: "XBT/USD"
        return self._get("/Ticker", {"pair": pair})
