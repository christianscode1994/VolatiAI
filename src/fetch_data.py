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
    url = "https://api.pushshift.io/reddit/search/submission/?subreddit=CryptoCurrency&sort=desc&size=50"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return []
        data = r.json().get("data", [])
        return [p.get("title", "") for p in data]
    except Exception:
        return []



def fetch_hn_titles():
    url = "https://hn.algolia.com/api/v1/search?tags=front_page"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    hits = r.json()["hits"]
    return [h["title"] for h in hits]

def fetch_cryptopanic():
    url = "https://cryptopanic.com/api/v1/posts/"
    params = {
        "auth_token": CRYPTOPANIC_TOKEN,
        "filter": "important",
        "kind": "news"
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        if r.status_code != 200:
            return []

        results = r.json().get("results", [])
        parsed = []

        for p in results:
            parsed.append({
                "title": p.get("title", ""),
                "source": p.get("source", {}).get("title", ""),
                "published_at": p.get("published_at", ""),
                "sentiment": p.get("votes", {}),
                "tags": p.get("tags", [])
            })

        return parsed

    except Exception:
        return []
