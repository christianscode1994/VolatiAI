import requests
from .config import KRAKEN_PAIR

KRAKEN_API = "https://api.kraken.com/0/public"

def kraken_ticker(pair: str = KRAKEN_PAIR):
    url = f"{KRAKEN_API}/Ticker"
    r = requests.get(url, params={"pair": pair}, timeout=10)
    r.raise_for_status()
    data = r.json()["result"]
    key = list(data.keys())[0]
    return data[key]

def kraken_depth(pair: str = KRAKEN_PAIR, count: int = 20):
    url = f"{KRAKEN_API}/Depth"
    r = requests.get(url, params={"pair": pair, "count": count}, timeout=10)
    r.raise_for_status()
    data = r.json()["result"]
    key = list(data.keys())[0]
    return data[key]

def kraken_ohlc(pair: str = KRAKEN_PAIR, interval: int = 15):
    url = f"{KRAKEN_API}/OHLC"
    r = requests.get(url, params={"pair": pair, "interval": interval}, timeout=10)
    r.raise_for_status()
    data = r.json()["result"]
    key = list(data.keys())[0]
    candles = data[key]
    last = data["last"]
    return {"candles": candles, "last": last}
