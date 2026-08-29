import requests
from .config import COINGECKO_API, TOP_N

def fetch_top_market_data(vs_currency="usd"):
    url = f"{COINGECKO_API}/coins/markets"
    params = {
        "vs_currency": vs_currency,
        "order": "market_cap_desc",
        "per_page": TOP_N,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "1h,24h,7d",
    }
    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    return r.json()

def fetch_reddit_titles():
    url = "https://www.reddit.com/r/CryptoCurrency/hot.json?limit=50"
    r = requests.get(url, headers={"User-Agent": "VolatiAI/1.0"}, timeout=10)
    r.raise_for_status()
    data = r.json()
    return [p["data"]["title"] for p in data["data"]["children"]]

def fetch_hn_titles():
    url = "https://hn.algolia.com/api/v1/search?tags=front_page"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    hits = r.json()["hits"]
    return [h["title"] for h in hits]
