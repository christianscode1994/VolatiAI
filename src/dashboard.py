from datetime import datetime
from history import read_snapshots
from metrics import (
    METRICS,
    aggregate_metric,
    volatai_score,
    detect_alerts,
)

# NEW: DeFi scoring + alerts
from defi_scoring import score_defi
from compute_defi_alerts import compute_defi_alerts


def build_dashboard(days: int = 7) -> dict:
    """
    Build a structured dashboard dictionary for the last N days.
    Includes market metrics + DeFi metrics + alerts + scoring.
    """
    dashboard = {
        "window_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "metrics": {},
        "defi": {},
        "composite_score": None,
        "alerts": [],
    }

    # Aggregate each metric
    aggregated = {}
    for metric in METRICS:
        snaps = read_snapshots(metric, days)
        aggregated[metric] = aggregate_metric(metric, snaps)
        dashboard["metrics"][metric] = aggregated[metric]

    # Load DeFi snapshot
    defi_snaps = read_snapshots("defi_health", days)
    if defi_snaps:
        latest_defi = defi_snaps[-1]

        # Compute DeFi score
        defi_score = score_defi(
            latest_defi.get("uniswap_liquidity", 0),
            latest_defi.get("sushiswap_liquidity", 0),
            latest_defi.get("curve_stability", 0),
            latest_defi.get("aave_utilization", 0),
            latest_defi.get("dai_peg_deviation", 0),
        )

        dashboard["defi"] = {
            "raw": latest_defi,
            "score": defi_score,
            "alerts": compute_defi_alerts(latest_defi),
        }

    # Composite score (market + defi)
    dashboard["composite_score"] = volatai_score(aggregated)

    # Global alerts (market + defi)
    dashboard["alerts"] = detect_alerts(aggregated)
    if dashboard["defi"]:
        dashboard["alerts"].extend(dashboard["defi"]["alerts"])

    return dashboard


def print_dashboard(days: int = 7) -> None:
    """
    Human-readable CLI dashboard.
    """
    d = build_dashboard(days)

    print("=== VolatiAI Dashboard ===")
    print(f"Window: last {d['window_days']} days")
    print(f"Generated at: {d['generated_at']}")
    print()
    print(f"Composite VolatiAI Score: {d['composite_score']:.4f}")
    print()

    # Market metrics
    for metric, info in d["metrics"].items():
        print(f"[{metric}]")
        print(f"  count = {info['count']}")
        print(f"  mean  = {info['mean']}")
        print(f"  min   = {info['min']}")
        print(f"  max   = {info['max']}")
        print()

    # NEW: DeFi section
    if d["defi"]:
        defi = d["defi"]
        raw = defi["raw"]

        print("=== DeFi Health ===")
        print(f"Score: {defi['score']:.4f}")
        print(f"Uniswap liquidity: {raw.get('uniswap_liquidity', 0):.2f}")
        print(f"SushiSwap liquidity: {raw.get('sushiswap_liquidity', 0):.2f}")
        print(f"Curve stability: {raw.get('curve_stability', 0):.2f}")
        print(f"Aave utilization: {raw.get('aave_utilization', 0):.2%}")
        print(f"DAI peg deviation: {raw.get('dai_peg_deviation', 0):.4f}")
        print()

    # Alerts
    if d["alerts"]:
        print("Alerts:")
        for alert in d["alerts"]:
            print(f" - {alert}")
    else:
        print("No alerts detected.")
