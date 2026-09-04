from pathlib import Path
import argparse
import logging
import cProfile
import pstats

from .fetch_data import fetch_top_market_data, fetch_reddit_titles, fetch_hn_titles
from .compute_volatility import compute_volatility_summary
from .compute_sentiment import compute_sentiment
from .generate_output import build_payload, write_json, write_html
from .history import write_snapshot
from .dashboard import print_dashboard
from .metrics import aggregate_all_metrics, volatai_score, detect_alerts
from .api import app  # for --api mode

# Intelligence layers (serverless, snapshot-based)
from .compute_defi_health import compute_defi_health_from_snapshots
from .api import (
    api_market_metrics,
    api_market_regime,
    api_market_stress_test,
    api_market_early_warning,
    api_market_intel_report,
)

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("volatai")


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
        defi_health = compute_defi_health_from_snapshots()
    except Exception as e:
        logger.error("DeFi health computation failed: %s", e)
        defi_health = None

    # -----------------------------
    # 4. MARKET INTELLIGENCE LAYER (M1–M5)
    # -----------------------------
    try:
        market_metrics = api_market_metrics(days=7)
        market_regime = api_market_regime(days=7)
        market_stress = api_market_stress_test(days=7)
        market_ew = api_market_early_warning(days=7)
        market_report = api_market_intel_report(days=7)
    except Exception as e:
        logger.error("Market intelligence failed: %s", e)
        market_metrics = {}
        market_regime = {}
        market_stress = {}
        market_ew = {}
        market_report = {}

    # -----------------------------
    # 5. BUILD PAYLOAD
    # -----------------------------
    payload = build_payload(
        coins_vol,
        sent_reddit,
        sent_hn,
        tier=tier,
        market=market_metrics,
        market_regime=market_regime,
        market_stress=market_stress,
        market_ew=market_ew,
        market_report=market_report,
        defi_health=defi_health,
    )

    # -----------------------------
    # 6. WRITE SNAPSHOTS
    # -----------------------------
    if write_snaps:
        try:
            write_snapshot("volatility", coins_vol)
            write_snapshot("sentiment", {"reddit": sent_reddit, "hn": sent_hn})
            write_snapshot("market", market_metrics)
            write_snapshot("defi_health", defi_health)
        except Exception as e:
            logger.error("Snapshot writing failed: %s", e)

    # -----------------------------
    # 7. OUTPUT FILES
    # -----------------------------
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

    # -----------------------------
    # 8. DASHBOARD
    # -----------------------------
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
