from typing import List, Dict, Any, Optional
from statistics import mean

METRICS = [
    "whales",
    "spoofing",
    "liquidity",
    "sentiment",
    "volatility",
]

DEFAULT_WEIGHTS = {
    "whales": 0.25,
    "spoofing": 0.20,
    "liquidity": 0.20,
    "sentiment": 0.20,
    "volatility": 0.15,
}


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def safe_mean(values: List[float]) -> Optional[float]:
    return mean(values) if values else None


def numeric(value: Any) -> bool:
    return isinstance(value, (int, float))


# --------------------------------------------------
# Metric Extraction
# --------------------------------------------------

def extract_metric_values(
    metric: str,
    snapshots: List[Dict[str, Any]]
) -> List[float]:

    values = []

    for snap in snapshots:

        value = None

        if metric in ("whales", "spoofing", "liquidity"):
            value = snap.get("score")

        elif metric == "sentiment":
            value = snap.get("avg")

            if value is None:
                value = snap.get("score")

        elif metric == "volatility":
            value = snap.get("price_change_percentage_24h")

            if value is None:
                value = snap.get("score")

        else:
            value = snap.get("score")

        if numeric(value):
            values.append(float(value))

    return values


# --------------------------------------------------
# Aggregation
# --------------------------------------------------

def aggregate_metric(
    metric: str,
    snapshots: List[Dict[str, Any]]
) -> Dict[str, Any]:

    values = extract_metric_values(metric, snapshots)

    return {
        "metric": metric,
        "count": len(values),
        "mean": safe_mean(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
    }


def aggregate_all_metrics(
    snapshot_reader,
    days: int = 7
) -> Dict[str, Dict[str, Any]]:

    aggregated = {}

    for metric in METRICS:
        snapshots = snapshot_reader.read_snapshots(
            metric,
            days
        )

        aggregated[metric] = aggregate_metric(
            metric,
            snapshots
        )

    return aggregated


# --------------------------------------------------
# VolatiAI Composite Score
# --------------------------------------------------

def volatai_score(
    agg: Dict[str, Dict[str, Any]],
    weights: Dict[str, float] = DEFAULT_WEIGHTS
) -> Optional[float]:

    total = 0.0
    used_weight = 0.0

    for metric, weight in weights.items():

        metric_data = agg.get(metric)

        if not metric_data:
            continue

        metric_mean = metric_data.get("mean")

        if metric_mean is None:
            continue

        total += metric_mean * weight
        used_weight += weight

    if used_weight == 0:
        return None

    return round(total / used_weight, 4)


# --------------------------------------------------
# Confidence Score
# --------------------------------------------------

def confidence_score(
    agg: Dict[str, Dict[str, Any]]
) -> float:

    total = len(METRICS)

    if total == 0:
        return 0.0

    available = sum(
        1
        for metric in METRICS
        if agg.get(metric)
        and agg[metric].get("count", 0) > 0
    )

    return round(available / total, 2)


# --------------------------------------------------
# Health Status
# --------------------------------------------------

def collector_health(
    agg: Dict[str, Dict[str, Any]]
) -> Dict[str, str]:

    return {
        metric:
        (
            "ok"
            if agg.get(metric)
            and agg[metric].get("count", 0) > 0
            else "failed"
        )
        for metric in METRICS
    }


# --------------------------------------------------
# Alerts
# --------------------------------------------------

def detect_alerts(
    agg: Dict[str, Dict[str, Any]]
) -> List[str]:

    alerts = []

    whales = agg.get("whales", {}).get("mean")
    spoofing = agg.get("spoofing", {}).get("mean")
    liquidity = agg.get("liquidity", {}).get("mean")
    volatility = agg.get("volatility", {}).get("mean")

    if whales is not None and whales > 0.8:
        alerts.append("High whale pressure detected")

    if spoofing is not None and spoofing > 0.7:
        alerts.append("Elevated spoofing activity")

    if liquidity is not None and liquidity < 0.3:
        alerts.append("Liquidity risk detected")

    if volatility is not None and volatility > 10:
        alerts.append("Volatility spike detected")

    return alerts
