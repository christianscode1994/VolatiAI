import requests

COINBASE_API = "https://api.exchange.coinbase.com"

def coinbase_ticker(product_id="BTC-USD"):
    url = f"{COINBASE_API}/products/{product_id}/ticker"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()

def coinbase_depth(product_id="BTC-USD", level=2):
    url = f"{COINBASE_API}/products/{product_id}/book"
    r = requests.get(url, params={"level": level}, timeout=10)
    r.raise_for_status()
    return r.json()

def coinbase_trades(product_id="BTC-USD"):
    url = f"{COINBASE_API}/products/{product_id}/trades"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()
