from pathlib import Path
from .fetch_data import fetch_top_market_data, fetch_reddit_titles, fetch_hn_titles
from .fetch_kraken import kraken_ticker, kraken_depth, kraken_ohlc
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .config import KRAKEN_PAIR

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"

def run_once(tier: str):
    coins = fetch_top_market_data()
    coins_vol = compute_volatility_summary(coins)

    reddit_titles = fetch_reddit_titles()
    hn_titles = fetch_hn_titles()

    sent_reddit = compute_sentiment(reddit_titles)
    sent_hn = compute_sentiment(hn_titles)

    kraken_data = None
    if tier == "pro":
        ticker = kraken_ticker(KRAKEN_PAIR)
        depth = kraken_depth(KRAKEN_PAIR, count=20)
        ohlc = kraken_ohlc(KRAKEN_PAIR, interval=15)
        kraken_data = {
            "pair": KRAKEN_PAIR,
            "ticker": ticker,
            "depth": depth,
            "ohlc": ohlc,
        }

    payload = build_payload(coins_vol, sent_reddit, sent_hn, tier=tier, kraken_data=kraken_data)

    if tier == "free":
        json_path = PUBLIC_DIR / "free.json"
        html_path = PUBLIC_DIR / "free.html"
    else:
        json_path = PRIVATE_DIR / "pro.json"
        html_path = PRIVATE_DIR / "pro.html"

    write_json(json_path, payload)
    write_html(html_path, payload)

def main():
    PUBLIC_DIR.mkdir(exist_ok=True)
    PRIVATE_DIR.mkdir(exist_ok=True)
    run_once("free")
    run_once("pro")

if __name__ == "__main__":
    main()
