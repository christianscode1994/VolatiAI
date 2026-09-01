import requests

BINANCE_API = "https://api.binance.com/api/v3"

def binance_ticker(symbol="BTCUSDT"):
    url = f"{BINANCE_API}/ticker/bookTicker"
    r = requests.get(url, params={"symbol": symbol}, timeout=10)
    r.raise_for_status()
    return r.json()

def binance_depth(symbol="BTCUSDT", limit=50):
    url = f"{BINANCE_API}/depth"
    r = requests.get(url, params={"symbol": symbol, "limit": limit}, timeout=10)
    r.raise_for_status()
    return r.json()

def binance_klines(symbol="BTCUSDT", interval="15m", limit=100):
    url = f"{BINANCE_API}/klines"
    r = requests.get(url, params={"symbol": symbol, "interval": interval, "limit": limit}, timeout=10)
    r.raise_for_status()
    return r.json()
