import requests

class CoinGecko:
    def __init__(self):
        self.base = "https://api.coingecko.com/api/v3"

    def global_market(self):
        url = f"{self.base}/global"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
