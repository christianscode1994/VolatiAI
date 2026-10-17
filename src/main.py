from pathlib import Path
import argparse
import json
import logging

from .fetch_data import fetch_top_market_data, fetch_hn_titles
from .fetch_kraken import kraken_ticker, kraken_depth
from .fetch_okx import okx_ticker, okx_depth

from .compute_whales import compute_whale_pressure
from .compute_spoofing import compute_spoofing_for_exchanges
from .compute_liquidity import compute_liquidity_snapshot
from .compute_arbitrage import compute_arbitrage_deltas
from .compute_depth_heatmap import compute_depth_heatmaps
from .compute_dev_sentiment import compute_dev_sentiment

from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .history import write_snapshot, SnapshotReader
from .dashboard import print_dashboard
from .metrics import aggregate_all_metrics, volatai_score, detect_alerts

from src.onchain.rpc import RPC
from src.onchain.intelligence import (
    build_chain_health,
    build_stablecoin_flows,
    build_whale_activity,
)
from src.chains.polkadot_health import get_polkadot_health

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("volatai")

def run_once(write_snaps: bool = True, show_dashboard: bool = False):
    logger.info("Running unified VolatiAI engine")

    # ---- Market + sentiment (Reddit removed) ----
    market = fetch_top_market_data()
    hn_titles = fetch_hn_titles()

    volatility = compute_volatility_summary(market)
    sentiment_hn = compute_sentiment(hn_titles)

    # ---- On-chain ----
    rpc = RPC()
    latest_block = rpc.get_block_number(provider="ethereum")

    from_block = max(0, latest_block - 100)
    to_block = latest_block

    # Polkadot health (Substrate RPC, not EVM)
    try:
        polkadot_health = get_polkadot_health()
        logger.info("Polkadot: block %s, peers %s", polkadot_health.get("latest_block"), polkadot_health.get("peers"))
    except Exception as e:
        logger.warning("Polkadot health failed: %s", e)
        polkadot_health = None

    onchain = {
        "chain_health": build_chain_health(rpc),
        "polkadot": polkadot_health,
        "stablecoin_flows": build_stablecoin_flows(rpc, from_block, to_block),
        "whale_activity": build_whale_activity(rpc, 50, from_block, to_block),
    }

    # ---- Exchange tickers + depth (best-effort, per-exchange isolation) ----
    exchanges = {}
    for name, tick_fn, depth_fn in [
        ("kraken", kraken_ticker, kraken_depth),
        ("okx", okx_ticker, okx_depth),
        # bybit: removed — API geo-blocks/rate-limits from cloud IPs
    ]:
        try:
            ticker = tick_fn()
        except Exception as e:
            logger.warning("Exchange %s ticker failed: %s", name, e)
            exchanges[name] = None
            continue

        depth = None
        try:
            depth = depth_fn()
        except Exception as e:
            logger.warning("Exchange %s depth failed: %s", name, e)

        exchanges[name] = {"ticker": ticker, "depth": depth}
        logger.info("Exchange %s: ticker + %s", name, "depth" if depth else "no depth")

    # ---- Unified payload ----
    # ---- Market microstructure (needs exchanges with depth) ----
    whales = None
    spoofing = None
    liquidity = None
    arbitrage = None
    depth_heatmaps = None

    try:
        whales = compute_whale_pressure(exchanges)
        logger.info("Whales: ok")
    except Exception as e:
        logger.warning("Whales failed: %s", e)

    try:
        spoofing = compute_spoofing_for_exchanges(exchanges)
        logger.info("Spoofing: ok")
    except Exception as e:
        logger.warning("Spoofing failed: %s", e)

    try:
        liquidity = compute_liquidity_snapshot(exchanges)
        logger.info("Liquidity: ok")
    except Exception as e:
        logger.warning("Liquidity failed: %s", e)

    try:
        arbitrage = compute_arbitrage_deltas(exchanges)
        logger.info("Arbitrage: ok")
    except Exception as e:
        logger.warning("Arbitrage failed: %s", e)

    try:
        depth_heatmaps = compute_depth_heatmaps(exchanges)
        logger.info("Depth heatmaps: ok")
    except Exception as e:
        logger.warning("Depth heatmaps failed: %s", e)

    dev_activity = None
    try:
        dev_activity = compute_dev_sentiment()
        logger.info(
            "Dev activity: %s protocols, %s commits (signal=%s)",
            dev_activity.get("protocols_tracked"),
            dev_activity.get("commits_total"),
            dev_activity.get("signal"),
        )
    except Exception as e:
        logger.warning("Dev activity failed: %s", e)

    # ---- Unified payload ----
    payload = build_payload(
        volatility,
        sentiment_hn,
        exchanges=exchanges,
        whales=whales,
        spoofing=spoofing,
        liquidity=liquidity,
        arbitrage=arbitrage,
        depth_heatmaps=depth_heatmaps,
        dev_activity=dev_activity,
    )

    # ---- Metrics (from snapshots) ----
    snapshot_reader = SnapshotReader()
    metrics = aggregate_all_metrics(snapshot_reader)
    score = volatai_score(metrics)
    alerts = detect_alerts(metrics)

    # ---- Persist snapshots so next run's metrics have data ----
    if write_snaps:
        try:
            write_snapshot("volatility", volatility)
            write_snapshot("sentiment", sentiment_hn)
            write_snapshot("market", market)
            write_snapshot("metrics", metrics)
        except Exception as e:
            logger.error("Snapshot writing failed: %s", e)

    if show_dashboard:
        try:
            print_dashboard(payload, metrics, score, alerts)
        except Exception as e:
            logger.error("Dashboard failed: %s", e)

    PUBLIC_DIR.mkdir(exist_ok=True)

    latest = {
        "payload": payload,
        "metrics": metrics,
        "score": score,
        "alerts": alerts,
        "onchain": onchain,
        "meta": {
            "latest_block": latest_block,
            "range": [from_block, to_block],
        },
    }

    # ---- Unified outputs ----
    write_json(PUBLIC_DIR / "latest.json", latest)
    write_html(PUBLIC_DIR / "summary.html", payload, score=score)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-snaps", action="store_true",
                        help="Skip writing snapshots this run")
    parser.add_argument("--dashboard", action="store_true")
    args = parser.parse_args()

    run_once(write_snaps=not args.no_snaps, show_dashboard=args.dashboard)
