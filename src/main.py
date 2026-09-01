from pathlib import Path
import argparse

from .fetch_data import fetch_top_market_data, fetch_reddit_titles, fetch_hn_titles
from .fetch_kraken import kraken_ticker, kraken_depth, kraken_ohlc
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .config import KRAKEN_PAIR
from .fetch_github import github_repo_activity, github_trending_python
from .compute_dev_sentiment import compute_dev_sentiment
from .compute_narratives import detect_narratives
from .fetch_binance import binance_depth, binance_ticker, binance_klines
from .fetch_coinbase import coinbase_depth, coinbase_ticker, coinbase_trades
from .fetch_crypto_com import crypto_com_depth, crypto_com_ticker, crypto_com_candles



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
    binance_data = None
    coinbase_data = None
    crypto_com_data = None

    if tier == "pro":
        # Kraken
        ticker = kraken_ticker(KRAKEN_PAIR)
        depth = kraken_depth(KRAKEN_PAIR, count=20)
        ohlc = kraken_ohlc(KRAKEN_PAIR, interval=15)
        kraken_data = {
            "pair": KRAKEN_PAIR,
            "ticker": ticker,
            "depth": depth,
            "ohlc": ohlc,
        }

        # Binance
        binance_data = {
            "ticker": binance_ticker("BTCUSDT"),
            "depth": binance_depth("BTCUSDT", limit=50),
            "klines": binance_klines("BTCUSDT", interval="15m", limit=100),
        }

        # Coinbase
        coinbase_data = {
            "ticker": coinbase_ticker("BTC-USD"),
            "depth": coinbase_depth("BTC-USD", level=2),
            "trades": coinbase_trades("BTC-USD"),
        }

        # Crypto.com
        crypto_com_data = {
            "ticker": crypto_com_ticker("BTC_USDT"),
            "depth": crypto_com_depth("BTC_USDT"),
            "candles": crypto_com_candles("BTC_USDT", interval="15m"),
        }

    payload = build_payload(
        coins_vol,
        sent_reddit,
        sent_hn,
        tier=tier,
        kraken_data=kraken_data,
        binance_data=binance_data,
        coinbase_data=coinbase_data,
        crypto_com_data=crypto_com_data,
    )

    if tier == "free":
        json_path = PUBLIC_DIR / "free.json"
        html_path = PUBLIC_DIR / "free.html"
    else:
        json_path = PRIVATE_DIR / "pro.json"
        html_path = PRIVATE_DIR / "pro.html"

    write_json(json_path, payload)
    write_html(html_path, payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tier", choices=["free", "pro"], default=None)
    args = parser.parse_args()

    PUBLIC_DIR.mkdir(exist_ok=True)
    PRIVATE_DIR.mkdir(exist_ok=True)

    if args.tier:
        run_once(args.tier)
    else:
        run_once("free")
        run_once("pro")

if __name__ == "__main__":
    main()
