# src/tools_kraken.py

import requests
from typing import Any, Dict, Optional


BASE_URL = "https://api.kraken.com/0/public"


class Kraken:
    def __init__(self, session: Optional[requests.Session] = None):
        self.session = session or requests.Session()

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{BASE_URL}{path}"
        resp = self.session.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("error"):
            raise RuntimeError(f"Kraken error: {data['error']}")
        return data["result"]

    def ticker(self, pair: str) -> Dict[str, Any]:
        # Kraken wants "XBTUSD", not "XBT/USD"
        normalized = pair.replace("/", "").replace("-", "").upper()

        result = self._get("/Ticker", {"pair": normalized})

        # Kraken returns:
        #   {"XXBTZUSD": {...ticker...}, "last": 1234567890}
        # Strip "last", then return the single pair's ticker.
        result.pop("last", None)

        if not result:
            return {}

        key = next(iter(result))
        return result[key]
