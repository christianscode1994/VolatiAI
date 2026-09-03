from history import read_snapshots, read_latest_snapshot
from metrics import (
    METRICS,
    aggregate_metric,
    volatai_score,
    detect_alerts,
)

from datetime import datetime, timedelta


def build_dashboard(days: int = 7) -> dict:
    """
    Build a structured dashboard dictionary for the last N days.
    This is the core data model that both CLI and API can use.
    """
    dashboard = {
        "window_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "metrics": {},
        "composite_score": None,
        "alerts": [],
    }

    # Aggregate each metric
    aggregated = {}
    for metric in METRICS:
        snaps = read_snapshots(metric, days)
        aggregated[metric] = aggregate_metric(metric, snaps)
        dashboard["metrics"][metric] = aggregated[metric]

    # Compute composite score
    dashboard["composite_score"] = volatai_score(aggregated)

    # Detect alerts
    dashboard["alerts"] = detect_alerts(aggregated)

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

    for metric, info in d["metrics"].items():
        print(f"[{metric}]")
        print(f"  count = {info['count']}")
        print(f"  mean  = {info['mean']}")
        print(f"  min   = {info['min']}")
        print(f"  max   = {info['max']}")
        print()

    if d["alerts"]:
        print("Alerts:")
        for alert in d["alerts"]:
            print(f" - {alert}")
    else:
        print("No alerts detected.")
