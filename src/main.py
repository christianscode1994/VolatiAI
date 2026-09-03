from pathlib import Path
import argparse
import logging
import cProfile
import pstats
from concurrent.futures import ThreadPoolExecutor, as_completed

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

from .history import write_snapshot
from .dashboard import print_dashboard
from .metrics import aggregate_all_metrics, volatai_score, detect_alerts
from .api import app  # for --api mode

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("volatai")


def _fetch_kraken():
    try:
        ticker = kraken_ticker(KRAKEN_PAIR)
        depth = kraken_depth(KRAKEN_PAIR, count=20)
        ohlc = kraken_ohlc(KRAKEN_PAIR, interval=15)
        return {
            "pair": KRAKEN_PAIR,
            "ticker": ticker,
            "depth": depth,
            "ohlc": ohlc,
        }
    except Exception as e:
        logger.error("Kraken fetch failed: %s", e)
        return {"error": str(e)}


def _fetch_binance():
    try:
        return {
            "ticker": binance_ticker("BTCUSDT"),
            "depth": binance_depth("BTCUSDT", limit=50),
            "klines": binance_klines("BTCUSDT", interval="15m", limit=100),
        }
    except Exception as e:
        logger.error("Binance fetch failed: %s", e)
        return {"error": str(e)}


def _fetch_coinbase():
    try:
        return {
            "ticker": coinbase_ticker("BTC-USD"),
            "depth": coinbase_depth("BTC-USD", level=2),
            "trades": coinbase_trades("BTC-USD"),
        }
    except Exception as e:
        logger.error("Coinbase fetch failed: %s", e)
        return {"error": str(e)}


def _fetch_crypto_com():
    try:
        return {
            "ticker": crypto_com_ticker("BTC_USDT"),
            "depth": crypto_com_depth("BTC_USDT"),
            "candles": crypto_com_candles("BTC_USDT", interval="15m"),
        }
    except Exception as e:
        logger.error("Crypto.com fetch failed: %s", e)
        return {"error": str(e)}


def _fetch_bybit():
    try:
        return {
            "ticker": bybit_ticker("BTCUSDT"),
            "depth": bybit_depth("BTCUSDT", limit=50),
        }
    except Exception as e:
        logger.error("Bybit fetch failed: %s", e)
        return {"error": str(e)}


def _fetch_okx():
    try:
        return {
            "ticker": okx_ticker("BTC-USDT"),
            "depth": okx_depth("BTC-USDT", limit=50),
        }
    except Exception as e:
        logger.error("OKX fetch failed: %s", e)
        return {"error": str(e)}


def run_once(tier: str, write_snaps: bool, show_dashboard: bool):
    logger.info("Running tier=%s", tier)

    try:
        coins = fetch_top_market_data()
        coins_vol = compute_volatility_summary(coins)

        reddit_titles = fetch_reddit_titles()
        hn_titles = fetch_hn_titles()

        sent_reddit = compute_sentiment(reddit_titles)
        sent_hn = compute_sentiment(hn_titles)
    except Exception as e:
        logger.error("Market/sentiment pipeline failed: %s", e)
        return

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
        # parallel exchange fetches
        tasks = {
            "kraken": _fetch_kraken,
            "binance": _fetch_binance,
            "coinbase": _fetch_coinbase,
            "crypto_com": _fetch_crypto_com,
            "bybit": _fetch_bybit,
            "okx": _fetch_okx,
        }
        results = {}
        with ThreadPoolExecutor(max_workers=len(tasks)) as ex:
            futures = {ex.submit(fn): name for name, fn in tasks.items()}
            for fut in as_completed(futures):
                name = futures[fut]
                results[name] = fut.result()

        kraken_data = results["kraken"]
        binance_data = results["binance"]
        coinbase_data = results["coinbase"]
        crypto_com_data = results["crypto_com"]
        bybit_data = results["bybit"]
        okx_data = results["okx"]

        exchanges = {
            "kraken": kraken_data,
            "binance": binance_data,
            "coinbase": coinbase_data,
            "crypto_com": crypto_com_data,
            "bybit": bybit_data,
            "okx": okx_data,
        }

        try:
            whales = compute_whale_pressure(exchanges)
            spoofing = compute_spoofing_for_exchanges(exchanges)
            liquidity = compute_liquidity_snapshot(exchanges)
            arbitrage = compute_arbitrage_deltas(exchanges)
            depth_heatmaps = compute_depth_heatmaps(exchanges)
        except Exception as e:
            logger.error("Metric computation failed: %s", e)

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

    if write_snaps:
        try:
            write_snapshot("whales", whales)
            write_snapshot("spoofing", spoofing)
            write_snapshot("liquidity", liquidity)
            write_snapshot("arbitrage", arbitrage)
            write_snapshot("volatility", coins_vol)
            write_snapshot("sentiment", {"reddit": sent_reddit, "hn": sent_hn})
            write_snapshot("developer", {})
        except Exception as e:
            logger.error("Snapshot writing failed: %s", e)

    PUBLIC_DIR.mkdir(exist_ok=True)
    PRIVATE_DIR.mkdir(exist_ok=True)

    if tier == "free":
        json_path = PUBLIC_DIR / "free.json"
        html_path = PUBLIC_DIR / "free.html"
    else:
        json_path = PRIVATE_DIR / "pro.json"
        html_path = PRIVATE_DIR / "pro.html"

    try:
        write_json(json_path, payload)
        write_html(html_path, payload)
    except Exception as e:
        logger.error("Output writing failed: %s", e)

    if show_dashboard:
        print_dashboard(days=7)
        aggregated = aggregate_all_metrics(__import__("volatiai.src.history"), days=7)
        score = volatai_score(aggregated)
        alerts = detect_alerts(aggregated)
        logger.info("Composite score: %.4f", score)
        if alerts:
            for a in alerts:
                logger.warning("Alert: %s", a)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tier", choices=["free", "pro"], default=None)
    parser.add_argument("--dashboard", action="store_true")
    parser.add_argument("--api", action="store_true")
    parser.add_argument("--no-snapshots", action="store_true")
    parser.add_argument("--profile", action="store_true")
    args = parser.parse_args()

    if args.api:
        # run API server (you’ll start uvicorn externally)
        logger.info("API mode selected. Use: uvicorn volatiai.src.api:app")
        return

    def _run():
        if args.tier:
            run_once(args.tier, write_snaps=not args.no_snapshots, show_dashboard=args.dashboard)
        else:
            run_once("free", write_snaps=not args.no_snapshots, show_dashboard=args.dashboard)
            run_once("pro", write_snaps=not args.no_snapshots, show_dashboard=args.dashboard)

    if args.profile:
        logger.info("Profiling enabled")
        profiler = cProfile.Profile()
        profiler.enable()
        _run()
        profiler.disable()
        stats = pstats.Stats(profiler).sort_stats(pstats.SortKey.TIME)
        stats.print_stats(30)
    else:
        _run()


if __name__ == "__main__":
    main()
