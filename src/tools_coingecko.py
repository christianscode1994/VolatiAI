import requests
import time

class CoinGecko:
    BASE = "https://api.coingecko.com/api/v3"

    def __init__(self, timeout=10, retries=3):
        self.timeout = timeout
        self.retries = retries

    def _get(self, path, params=None):
        url = f"{self.BASE}{path}"
        for attempt in range(self.retries):
            try:
                r = requests.get(url, params=params, timeout=self.timeout)
                if r.status_code == 200:
                    return r.json()
                # Rate limit → wait and retry
                if r.status_code == 429:
                    time.sleep(1.2)
                    continue
                return None
            except Exception:
                time.sleep(0.5)
        return None

    # -----------------------------
    # Public API wrappers
    # -----------------------------

    def ping(self):
        return self._get("/ping")

    def simple_price(self, ids, vs="usd"):
        return self._get("/simple/price", {
            "ids": ids,
            "vs_currencies": vs
        })

    def market_chart(self, coin_id, vs="usd", days=1):
        return self._get(f"/coins/{coin_id}/market_chart", {
            "vs_currency": vs,
            "days": days
        })

    def trending(self):
        return self._get("/search/trending")

    def coin_info(self, coin_id):
        return self._get(f"/coins/{coin_id}", {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "false",
            "developer_data": "false",
            "sparkline": "false"
        })

    # -----------------------------
    # Convenience utilities
    # -----------------------------

    def batch_prices(self, coin_list, vs="usd"):
        ids = ",".join(coin_list)
        return self.simple_price(ids, vs)

    def top_movers(self, limit=10):
        trending = self.trending()
        if not trending or "coins" not in trending:
            return []
        return trending["coins"][:limit]
