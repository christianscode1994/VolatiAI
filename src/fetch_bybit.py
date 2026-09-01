import requests

BYBIT_API = "https://api.bybit.com/v5/market"

def bybit_ticker(symbol="BTCUSDT"):
    r = requests.get(f"{BYBIT_API}/tickers", params={"category": "spot", "symbol": symbol}, timeout=10)
    r.raise_for_status()
    return r.json()["result"]["list"][0]

def bybit_depth(symbol="BTCUSDT", limit=50):
    r = requests.get(f"{BYBIT_API}/orderbook", params={"category": "spot", "symbol": symbol, "limit": limit}, timeout=10)
    r.raise_for_status()
    return r.json()["result"]
