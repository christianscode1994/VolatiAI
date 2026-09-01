import requests

OKX_API = "https://www.okx.com/api/v5/market"

def okx_ticker(inst="BTC-USDT"):
    r = requests.get(f"{OKX_API}/ticker", params={"instId": inst}, timeout=10)
    r.raise_for_status()
    return r.json()["data"][0]

def okx_depth(inst="BTC-USDT", limit=50):
    r = requests.get(f"{OKX_API}/books", params={"instId": inst, "sz": limit}, timeout=10)
    r.raise_for_status()
    return r.json()["data"][0]
