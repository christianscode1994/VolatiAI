import requests

CRYPTOCOM_API = "https://api.crypto.com/v2/public"

def crypto_com_ticker(symbol="BTC_USDT"):
    url = f"{CRYPTOCOM_API}/get-ticker"
    r = requests.get(url, params={"instrument_name": symbol}, timeout=10)
    r.raise_for_status()
    return r.json()["result"]["data"]

def crypto_com_depth(symbol="BTC_USDT"):
    url = f"{CRYPTOCOM_API}/get-book"
    r = requests.get(url, params={"instrument_name": symbol}, timeout=10)
    r.raise_for_status()
    return r.json()["result"]["data"]

def crypto_com_candles(symbol="BTC_USDT", interval="15m"):
    url = f"{CRYPTOCOM_API}/get-candlestick"
    r = requests.get(url, params={"instrument_name": symbol, "timeframe": interval}, timeout=10)
    r.raise_for_status()
    return r.json()["result"]["data"]
