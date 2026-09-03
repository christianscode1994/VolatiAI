from typing import List, Dict, Any
from statistics import mean
from math import isnan

# Metrics you track. Add more as you formalize them.
METRICS = ["whales", "spoofing", "liquidity", "sentiment", "volatility"]

# Default weights for composite score
DEFAULT_WEIGHTS = {
    "whales": 0.25,
    "spoofing": 0.20,
    "liquidity": 0.20,
    "sentiment": 0.20,
    "volatility": 0.15,
}


# --- BASIC HELPERS ---

def extract_scores(snapshots: List[Dict[str, Any]]) -> List[float]:
    """Extract numeric 'score' values from snapshots."""
    out = []
    for snap in snapshots:
        score = snap.get("score")
        if isinstance(score, (int, float)):
            out.append(score)
    return out


def safe_mean(values: List[float]) -> float:
    """Mean that returns NaN instead of crashing on empty lists."""
    return mean(values) if values else float("nan")


# --- METRIC AGGREGATION ---

def aggregate_metric(metric: str, snapshots: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute basic statistics for a metric over a list of snapshots.
    """
    scores = extract_scores(snapshots)

    return {
        "metric": metric,
        "count": len(scores),
        "mean": safe_mean(scores),
        "min": min(scores) if scores else None,
        "max": max(scores) if scores else None,
    }


def aggregate_all_metrics(snapshot_reader, days: int = 7) -> Dict[str, Dict[str, Any]]:
    """
    Aggregates all metrics over the last N days using the reader API.
    snapshot_reader must provide: read_snapshots(metric, days)
    """
    agg = {}
    for metric in METRICS:
        snaps = snapshot_reader.read_snapshots(metric, days)
        agg[metric] = aggregate_metric(metric, snaps)
    return agg


# --- COMPOSITE SCORE ---

def volatai_score(agg: Dict[str, Dict[str, Any]],
                  weights: Dict[str, float] = DEFAULT_WEIGHTS) -> float:
    """
    Compute the unified VolatiAI score from aggregated metrics.
    """
    total = 0.0
    weight_sum = 0.0

    for metric, weight in weights.items():
        m = agg.get(metric)
        if not m:
            continue

        mean_val = m.get("mean")
        if mean_val is None or isnan(mean_val):
            continue

        total += mean_val * weight
        weight_sum += weight

    return total / weight_sum if weight_sum > 0 else float("nan")


# --- ALERTS (simple rules, expand later) ---

def detect_alerts(agg: Dict[str, Dict[str, Any]]) -> List[str]:
    alerts = []

    # Whale pressure spike
    if "whales" in agg and agg["whales"]["mean"] and agg["whales"]["mean"] > 0.8:
        alerts.append("High whale pressure detected")

    # Spoofing risk
    if "spoofing" in agg and agg["spoofing"]["mean"] and agg["spoofing"]["mean"] > 0.7:
        alerts.append("Spoofing activity elevated")

    # Liquidity collapse
    if "liquidity" in agg and agg["liquidity"]["mean"] and agg["liquidity"]["mean"] < 0.3:
        alerts.append("Liquidity risk detected")

    return alerts
