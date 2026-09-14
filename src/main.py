from pathlib import Path
import argparse
import logging
import cProfile
import pstats

# -----------------------------
# DATA PIPELINES
# -----------------------------
from .fetch_data import fetch_top_market_data, fetch_reddit_titles, fetch_hn_titles
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .history import write_snapshot
from .dashboard import print_dashboard
from .metrics import aggregate_all_metrics, volatai_score, detect_alerts

# Unified API (FastAPI app only)
from .api import app
from .api import api_metric, api_sentiment_metrics, api_macro_metrics, api_defi_health

# On-chain intelligence (Pro tier)
from src.onchain.rpc import RPC
from src.onchain.intelligence import (
    build_chain_health,
    build_stablecoin_flows,
    build_whale_activity,
)

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("volatai")


# ============================================================
# ========================= RUN ONCE ==========================
# ============================================================

def run_once(tier: str, write_snaps: bool, show_dashboard: bool):
    logger.info("Running tier=%s", tier)

    # -----------------------------
    # 1. MARKET SNAPSHOTS
    # -----------------------------
    try:
        coins = fetch_top_market_data()
        coins_vol = compute_volatility_summary(coins)
    except Exception as e:
        logger.error("Market pipeline failed: %s", e)
        return

    # -----------------------------
    # 2. SENTIMENT SNAPSHOTS
    # -----------------------------
    try:
        reddit_titles = fetch_reddit_titles()
        hn_titles = fetch_hn_titles()

        sent_reddit = compute_sentiment(reddit_titles)
        sent_hn = compute_sentiment(hn_titles)
    except Exception as e:
        logger.error("Sentiment pipeline failed: %s", e)
        return

    # -----------------------------
    # 3. DEFI HEALTH (SNAPSHOT-BASED)
    # -----------------------------
    try:
        defi_health = api_defi_health(days=7)
    except Exception as e:
        logger.error("DeFi health computation failed: %s", e)
        defi_health = {}

    # -----------------------------
    # 3B. ON-CHAIN INTELLIGENCE (PRO ONLY)
    # -----------------------------
    chain_health = None
    stablecoin_flows = None
    whale_data = None

    if tier == "pro":
        try:
            rpc = RPC()
            chain_health = build_chain_health(rpc)

            latest_block = chain_health["latest_block"]
            from_block = max(0, latest_block - 200)

            stablecoin_flows = build_stablecoin_flows(rpc, from_block, latest_block)
            whale_data = build_whale_activity(
                rpc,
                min_value_eth=100.0,
                from_block=from_block,
                to_block=latest_block,
            )
        except Exception as e:
            logger.error("On-chain intelligence failed: %s", e)
            chain_health = None
            stablecoin_flows = None
            whale_data = None

    # -----------------------------
    # 4. MARKET INTELLIGENCE (Unified)
    # -----------------------------
    try:
        market = api_metric("market", days=7)
        market_metrics = market["aggregated"]
    except Exception as e:
        logger.error("Unified market intelligence failed: %s", e)
        market_metrics = {}

    # -----------------------------
    # 5. BUILD PAYLOAD
    # -----------------------------
    payload = build_payload(
        coins_vol,
        sent_reddit,
        sent_hn,
        tier=tier,
        market=market_metrics,
        defi_health=defi_health,
    )

    # -----------------------------
    # 5B. NEW INTELLIGENCE LAYER SNAPSHOTS
    # -----------------------------

    # Narrative (N1–N5)
    narrative_data = {
        "topics": reddit_titles[:10],
        "intensity": round(sent_reddit["score"] * 0.4 + sent_hn["score"] * 0.3, 6),
        "dispersion": round(abs(sent_reddit["score"] - sent_hn["score"]), 6),
        "coherence": round(1.0 - abs(sent_reddit["score"] - sent_hn["score"]), 6),
    }

    # Risk (R1–R5)
    risk_data = {
        "market_risk": round(min(market_metrics.get("volatility", 0.0) * 2.0, 1.0), 6),
        "defi_risk": round(defi_health.get("stress_level", 0.0), 6),
        "liquidity_risk": round(1.0 - market_metrics.get("liquidity_score", 0.5), 6),
        "sentiment_risk": round(
            1.0 - ((sent_reddit["score"] + sent_hn["score"]) / 2.0 + 0.5), 6
        ),
    }

    # Asset (A1–A5)
    asset_data = {}
    for symbol in coins_vol.keys():
        asset_data[symbol] = {
            "volatility": round(coins_vol[symbol], 6),
            "return": round(coins.get(symbol, {}).get("return", 0.0), 6),
            "sentiment": round((sent_reddit["score"] + sent_hn["score"]) / 2.0, 6),
            "defi_exposure": round(
                defi_health.get("exposure_map", {}).get(symbol, 0.1), 6
            ),
        }

    # Sector (C1–C5)
    sector_map = {
        "L1": ["BTC", "ETH", "SOL", "ADA", "AVAX"],
        "L2": ["MATIC", "OP", "ARB"],
        "DEFI": ["UNI", "AAVE", "CRV", "MKR"],
        "AI": ["FET", "AGIX", "RNDR"],
        "MEME": ["DOGE", "SHIB", "PEPE"],
    }

    sector_data = {}
    for sector, assets in sector_map.items():
        vals = [asset_data[a]["return"] for a in assets if a in asset_data]
        score = sum(vals) / len(vals) if vals else 0.0
        sector_data[sector] = {"score": round(score, 6)}

    # Global (G1–G5)
    global_data = {
        "fusion_score": round(
            (market_metrics.get("mean", 0.0) * 0.3)
            + ((sent_reddit["score"] + sent_hn["score"]) / 2.0 * 0.2)
            + (1.0 - risk_data["market_risk"]) * 0.2
            + (1.0 - risk_data["defi_risk"]) * 0.2
            + (1.0 - risk_data["liquidity_risk"]) * 0.1,
            6,
        ),
        "global_regime": "constructive"
        if (market_metrics.get("mean", 0.0) > 0.01 and risk_data["market_risk"] < 0.4)
        else "fragile"
        if risk_data["market_risk"] > 0.7
        else "balanced",
    }

    # On-chain enrichment (Pro only)
    if tier == "pro" and chain_health:
        bt_vol = chain_health.get("block_time_volatility_sec") or 0.0
        gas_wei = chain_health.get("gas_price_wei") or 0

        penalty = 0.0
        if bt_vol > 3.0:
            penalty += 0.05
        if gas_wei > 80 * 10**9:
            penalty += 0.05

        global_data["fusion_score"] = round(
            max(global_data["fusion_score"] - penalty, 0.0), 6
        )

        global_data["chain_health"] = {
            "latest_block": chain_health["latest_block"],
            "avg_block_time_sec": chain_health["avg_block_time_sec"],
            "block_time_volatility_sec": chain_health["block_time_volatility_sec"],
            "gas_price_wei": chain_health["gas_price_wei"],
        }

    # -----------------------------
    # 6. WRITE SNAPSHOTS
    # -----------------------------
    if write_snaps:
        try:
            write_snapshot("volatility", coins_vol)
            write_snapshot("sentiment", {"reddit": sent_reddit, "hn": sent_hn})
            write_snapshot("market", market_metrics)
            write_snapshot("defi_health", defi_health)

            write_snapshot("narrative", narrative_data)
            write_snapshot("risk", risk_data)
            write_snapshot("asset", asset_data)
            write_snapshot("sector", sector_data)
            write_snapshot("global", global_data)

            if tier == "pro":
                if chain_health:
                    write_snapshot("chain_health", chain_health)
                if stablecoin_flows:
                    write_snapshot("stablecoin_flows", stablecoin_flows)
                if whale_data:
                    write_snapshot("whale_activity", whale_data)

        except Exception as e:
            logger.error("Snapshot writing failed: %s", e)

    # -----------------------------
    # 7. OUTPUT FILES
    # -----------------------------
    PUBLIC_DIR.mkdir(exist_ok=True)
    PRIVATE_DIR.mkdir(exist_ok=True)

    if tier == "free":
        json
