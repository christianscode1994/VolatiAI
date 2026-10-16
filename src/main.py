from pathlib import Path
import argparse
import json
import logging

from .fetch_data import fetch_top_market_data, fetch_hn_titles
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload
from .history import write_snapshot, SnapshotReader
from .dashboard import print_dashboard
from .metrics import aggregate_all_metrics, volatai_score, detect_alerts

from src.onchain.rpc import RPC
from src.onchain.intelligence import (
    build_chain_health,
    build_stablecoin_flows,
    build_whale_activity,
)

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("volatai")


def run_once(write_snaps: bool = False, show_dashboard: bool = False):
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

    onchain = {
        "chain_health": build_chain_health(rpc),
        "stablecoin_flows": build_stablecoin_flows(rpc, from_block, to_block),
        "whale_activity": build_whale_activity(rpc, 50, from_block, to_block),
    }

    # ---- Unified payload (no reddit arg) ----
    payload = build_payload(market, sentiment_hn)

    # ---- Metrics ----
    snapshot_reader = SnapshotReader()
    metrics = aggregate_all_metrics(snapshot_reader)
    score = volatai_score(metrics)
    alerts = detect_alerts(metrics)

    # ---- Optional snapshots ----
    if write_snaps:
        try:
            write_snapshot("volatility", volatility)
            write_snapshot("sentiment", {"hn": sentiment_hn})
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

    # ---- Unified JSON output ----
    with open(PUBLIC_DIR / "latest.json", "w") as f:
        json.dump(latest, f, indent=2)

    # ---- Unified HTML summary ----
    html = f"""
    <html>
    <head><title>VolatiAI Summary</title></head>
    <body>
        <h1>VolatiAI Intelligence Summary</h1>
        <p>Latest block: {latest_block}</p>

        <h2>Top by Volatility</h2>
        <pre>{json.dumps(payload.get('top_by_volatility'), indent=2)}</pre>

        <h2>Sentiment</h2>
        <pre>{json.dumps(payload.get('sentiment'), indent=2)}</pre>

        <h2>Exchanges</h2>
        <pre>{json.dumps(payload.get('exchanges'), indent=2)}</pre>

        <h2>Whales</h2>
        <pre>{json.dumps(payload.get('whales'), indent=2)}</pre>

        <h2>Spoofing</h2>
        <pre>{json.dumps(payload.get('spoofing'), indent=2)}</pre>

        <h2>Liquidity</h2>
        <pre>{json.dumps(payload.get('liquidity'), indent=2)}</pre>

        <h2>Arbitrage</h2>
        <pre>{json.dumps(payload.get('arbitrage'), indent=2)}</pre>

        <h2>Depth Heatmaps</h2>
        <pre>{json.dumps(payload.get('depth_heatmaps'), indent=2)}</pre>

        <h2>On-Chain</h2>
        <pre>{json.dumps(onchain, indent=2)}</pre>

        <h2>Score</h2>
        <pre>{score}</pre>

        <h2>Alerts</h2>
        <pre>{json.dumps(alerts, indent=2)}</pre>
    </body>
    </html>
    """

    with open(PUBLIC_DIR / "summary.html", "w") as f:
        f.write(html)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--snaps", action="store_true")
    parser.add_argument("--dashboard", action="store_true")
    args = parser.parse_args()

    run_once(write_snaps=args.snaps, show_dashboard=args.dashboard)
