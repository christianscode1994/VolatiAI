from typing import List, Dict, Any, Optional
from statistics import mean
from math import isnan, isinf

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

STABLECOINS = {
    "usdt",
    "usdc",
    "dai",
    "fdusd",
    "usde",
    "tusd",
    "usdp",
}


# --------------------------------------------------
# Helpers
# --------------------------------------------------


def numeric(value: Any) -> bool:
    if not isinstance(value, (int, float)):
        return False

    if isinstance(value, bool):
        return False

    if isnan(value):
        return False

    if isinf(value):
        return(False)

    return True


def safe_mean(values: List[float]) -> Optional[float]:
    return round(mean(values), 4) if values else None


# --------------------------------------------------
# Metric Extraction
# --------------------------------------------------


def extract_metric_values(
    metric: str,
    snapshots: List[Dict[str, Any]]
) -> List[float]:

    values: List[float] = []

    for snap in snapshots:

        # ----------------------------------------
        # WHALES / SPOOFING
        # ----------------------------------------

        if metric in ("whales", "spoofing"):

            score = snap.get("score")

            if numeric(score):
                values.append(float(score))

            continue

        # ----------------------------------------
        # LIQUIDITY
        # ----------------------------------------

        if metric == "liquidity":

            score = snap.get("score")

            # New schema:
            # { "score": 82.3 }

            if numeric(score):
                values.append(float(score))
                continue

            # Legacy schema:
            # {
            #   "score": {
            #       "aggregate": {
            #           "liquidity_score": 82.3
            #       }
            #   }
            # }

            if isinstance(score, dict):

                aggregate = score.get(
                    "aggregate",
                    {}
                )

                liquidity_score = aggregate.get(
                    "liquidity_score"
                )

                if numeric(liquidity_score):
                    values.append(
                        float(liquidity_score)
                    )

            continue

        # ----------------------------------------
        # SENTIMENT
        # ----------------------------------------

        if metric == "sentiment":

            for source in (
                "reddit",
                "hn",
                "pushshift",
            ):

                block = snap.get(source)

                if not isinstance(block, dict):
                    continue

                avg = block.get("avg")

                if numeric(avg):
                    values.append(float(avg))

            continue

        # ----------------------------------------
        # VOLATILITY
        # ----------------------------------------

        if metric == "volatility":

            if isinstance(snap, list):
                assets = snap
            elif isinstance(snap, dict):
                assets = snap.get("top_by_volatility", [])
            else:
                continue

            if not isinstance(assets, list):
                continue

            for asset in assets:

                if not isinstance(asset, dict):
                    continue

                symbol = (
                    asset.get("symbol", "")
                    .lower()
                    .strip()
                )

                # Ignore stablecoins
                if symbol in STABLECOINS:
                    continue

                pct = asset.get(
                    "price_change_24h"
                )

                if numeric(pct):
                    values.append(float(pct))

            continue

    return values


# --------------------------------------------------
# Aggregation
# --------------------------------------------------


def aggregate_metric(
    metric: str,
    snapshots: List[Dict[str, Any]]
) -> Dict[str, Any]:

    values = extract_metric_values(
        metric,
        snapshots,
    )

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

    aggregated: Dict[str, Dict[str, Any]] = {}

    for metric in METRICS:

        snapshots = snapshot_reader.read_snapshots(
            metric,
            days
        )

        aggregated[metric] = aggregate_metric(
            metric,
            snapshots,
        )

    return aggregated


# --------------------------------------------------
# Composite Score
# --------------------------------------------------


def volatai_score(
    agg: Dict[str, Dict[str, Any]],
    weights: Dict[str, float] = DEFAULT_WEIGHTS,
) -> Optional[float]:

    total = 0.0
    active_weight = 0.0

    for metric, weight in weights.items():

        metric_data = agg.get(metric)

        if not metric_data:
            continue

        metric_mean = metric_data.get("mean")

        if metric_mean is None:
            continue

        total += metric_mean * weight
        active_weight += weight

    if active_weight == 0:
        return None

    return round(
        total / active_weight,
        4,
    )


# --------------------------------------------------
# Confidence Score
# --------------------------------------------------


def confidence_score(
    agg: Dict[str, Dict[str, Any]]
) -> float:

    total_metrics = len(METRICS)

    if total_metrics == 0:
        return 0.0

    available_metrics = sum(
        1
        for metric in METRICS
        if (
            agg.get(metric)
            and agg[metric].get("count", 0) > 0
        )
    )

    return round(
        available_metrics / total_metrics,
        2,
    )


# --------------------------------------------------
# Health Status
# --------------------------------------------------


def collector_health(
    agg: Dict[str, Dict[str, Any]]
) -> Dict[str, str]:

    health: Dict[str, str] = {}

    for metric in METRICS:

        metric_data = agg.get(metric)

        if (
            metric_data
            and metric_data.get("count", 0) > 0
        ):
            health[metric] = "ok"
        else:
            health[metric] = "failed"

    return health


# --------------------------------------------------
# Alerts
# --------------------------------------------------


def detect_alerts(
    agg: Dict[str, Dict[str, Any]]
) -> List[str]:

    alerts: List[str] = []

    whales = (
        agg.get("whales", {})
        .get("mean")
    )

    spoofing = (
        agg.get("spoofing", {})
        .get("mean")
    )

    liquidity = (
        agg.get("liquidity", {})
        .get("mean")
    )

    volatility = (
        agg.get("volatility", {})
        .get("mean")
    )

    sentiment = (
        agg.get("sentiment", {})
        .get("mean")
    )

    # Whale pressure
    if (
        whales is not None
        and whales > 0.8
    ):
        alerts.append(
            "High whale pressure detected"
        )

    # Spoofing
    if (
        spoofing is not None
        and spoofing > 0.7
    ):
        alerts.append(
            "Elevated spoofing activity"
        )

    # Low liquidity
    if (
        liquidity is not None
        and liquidity < 0.3
    ):
        alerts.append(
            "Liquidity risk detected"
        )

    # Volatility: use absolute percentage; threshold chosen as 10% (tunable)
    if (
        volatility is not None
        and abs(volatility) > 10.0
    ):
        alerts.append(
            "High market volatility detected"
        )

    # Sentiment: negative sentiment triggers alert; positive sentiment noted but optional
    if sentiment is not None:
        if sentiment < -0.3:
            alerts.append(
                "Negative market sentiment detected"
            )
        elif sentiment > 0.3:
            alerts.append(
                "Positive market sentiment"
            )

    return alerts
