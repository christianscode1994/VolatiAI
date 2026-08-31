import requests
from bs4 import BeautifulSoup
from .config import COINGECKO_API, TOP_N
from textblob import TextBlob


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


def fetch_twitter_nitter(query="bitcoin OR crypto OR ethereum"):
    # Use a stable Nitter instance
    base = "https://nitter.net/search?f=tweets&q="
    url = base + requests.utils.quote(query)

    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return []

        soup = BeautifulSoup(r.text, "html.parser")
        tweets = []

        for item in soup.select(".timeline-item"):
            content = item.select_one(".tweet-content")
            if not content:
                continue

            author = item.select_one(".username")
            time_tag = item.select_one("time")

            tweets.append({
                "text": content.get_text(strip=True),
                "author": author.get_text(strip=True) if author else "",
                "published": time_tag["datetime"] if time_tag else "",
            })

        return tweets

    except Exception:
        return []

def score_twitter_sentiment(tweets):
    score = 0
    for t in tweets:
        polarity = TextBlob(t["text"]).sentiment.polarity
        score += polarity
    return score




