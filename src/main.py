from pathlib import Path
import argparse

from .fetch_data import fetch_top_market_data, fetch_reddit_titles, fetch_hn_titles
from .fetch_kraken import kraken_ticker, kraken_depth, kraken_ohlc
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .config import KRAKEN_PAIR

from .fetch_binance import binance_depth, binance_ticker, binance_klines
from .fetch_coinbase import coinbase_depth, coinbase_ticker, coinbase_trades
from .fetch_crypto_com import crypto_com_depth, crypto_com_ticker, crypto_com_candles
from .fetch_bybit import bybit_depth, bybit_ticker
from .fetch_okx import okx_depth, okx_ticker

from .compute_whales import compute_whale_pressure
from .compute_spoofing import compute_spoofing_for_exchanges
from .compute_liquidity import compute_liquidity_snapshot
from .compute_arbitrage import compute_arbitrage_deltas
from .compute_depth_heatmap import compute_depth_heatmaps

# NEW: historical storage
from .history import write_snapshot

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"


def run_once(tier: str):
    # --- Market & sentiment ---
    coins = fetch_top_market_data()
    coins_vol = compute_volatility_summary(coins)

    reddit_titles = fetch_reddit_titles()
    hn_titles = fetch_hn_titles()

    sent_reddit = compute_sentiment(reddit_titles)
    sent_hn = compute_sentiment(hn_titles)

    # --- Exchange data placeholders ---
    kraken_data = None
    binance_data = None
    coinbase_data = None
    crypto_com_data = None
    bybit_data = None
    okx_data = None

    whales = None
    spoofing = None
    liquidity = None
    arbitrage = None
    depth_heatmaps = None

    if tier == "pro":

        # Kraken
        try:
            ticker = kraken_ticker(KRAKEN_PAIR)
            depth = kraken_depth(KRAKEN_PAIR, count=20)
            ohlc = kraken_ohlc(KRAKEN_PAIR, interval=15)
            kraken_data = {
                "pair": KRAKEN_PAIR,
                "ticker": ticker,
                "depth": depth,
                "ohlc": ohlc,
            }
        except Exception as e:
            kraken_data = {"error": str(e)}

        # Binance
        try:
            binance_data = {
                "ticker": binance_ticker("BTCUSDT"),
                "depth": binance_depth("BTCUSDT", limit=50),
                "klines": binance_klines("BTCUSDT", interval="15m", limit=100),
            }
        except Exception as e:
            binance_data = {"error": str(e)}

        # Coinbase
        try:
            coinbase_data = {
                "ticker": coinbase_ticker("BTC-USD"),
                "depth": coinbase_depth("BTC-USD", level=2),
                "trades": coinbase_trades("BTC-USD"),
            }
        except Exception as e:
            coinbase_data = {"error": str(e)}

        # Crypto.com
        try:
            crypto_com_data = {
                "ticker": crypto_com_ticker("BTC_USDT"),
                "depth": crypto_com_depth("BTC_USDT"),
                "candles": crypto_com_candles("BTC_USDT", interval="15m"),
            }
        except Exception as e:
            crypto_com_data = {"error": str(e)}

        # Bybit
        try:
            bybit_data = {
                "ticker": bybit_ticker("BTCUSDT"),
                "depth": bybit_depth("BTCUSDT", limit=50),
            }
        except Exception as e:
            bybit_data = {"error": str(e)}

        # OKX
        try:
            okx_data = {
                "ticker": okx_ticker("BTC-USDT"),
                "depth": okx_depth("BTC-USDT", limit=50),
            }
        except Exception as e:
            okx_data = {"error": str(e)}

        # Whale Intelligence
        exchanges = {
            "kraken": kraken_data,
            "binance": binance_data,
            "coinbase": coinbase_data,
            "crypto_com": crypto_com_data,
            "bybit": bybit_data,
            "okx": okx_data,
        }

        whales = compute_whale_pressure(exchanges)
        spoofing = compute_spoofing_for_exchanges(exchanges)
        liquidity = compute_liquidity_snapshot(exchanges)
        arbitrage = compute_arbitrage_deltas(exchanges)
        depth_heatmaps = compute_depth_heatmaps(exchanges)

    # --- Build payload ---
    payload = build_payload(
        coins_vol,
        sent_reddit,
        sent_hn,
        tier=tier,
        kraken_data=kraken_data,
        binance_data=binance_data,
        coinbase_data=coinbase_data,
        crypto_com_data=crypto_com_data,
        bybit_data=bybit_data,
        okx_data=okx_data,
        whales=whales,
        spoofing=spoofing,
        liquidity=liquidity,
        arbitrage=arbitrage,
        depth_heatmaps=depth_heatmaps,
    )

    # --- Historical snapshots ---
    write_snapshot("whales", whales)
    write_snapshot("spoofing", spoofing)
    write_snapshot("liquidity", liquidity)
    write_snapshot("arbitrage", arbitrage)
    write_snapshot("volatility", coins_vol)
    write_snapshot("sentiment", {"reddit": sent_reddit, "hn": sent_hn})
    write_snapshot("developer", {})  # placeholder until dev module added

    # --- Output ---
    PUBLIC_DIR.mkdir(exist_ok=True)
    PRIVATE_DIR.mkdir(exist_ok=True)

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

    if args.tier:
        run_once(args.tier)
    else:
        run_once("free")
        run_once("pro")


if __name__ == "__main__":
    main()
