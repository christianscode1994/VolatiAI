import requests

class CoinPaprika:
    BASE = "https://api.coinpaprika.com/v1"

    def global_market(self):
        return requests.get(f"{self.BASE}/global", timeout=10).json()

    def ticker(self, coin_id="btc-bitcoin"):
        return requests.get(f"{self.BASE}/tickers/{coin_id}", timeout=10).json()
