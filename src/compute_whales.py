# src/compute_whales.py

from typing import Dict, Any, Optional

SCHEMA_VERSION = "2.0"

DEFAULT_WEIGHTS = {
    "binance": 0.40,
    "bybit": 0.25,
    "coinbase": 0.20,
    "kraken": 0.15,
}

TOP_LEVELS = 20


def _normalize_depth(depth: Any) -> Optional[Dict[str, Any]]:
    """
    Normalize exchange depth into:

    {
        "asks": [...],
        "bids": [...]
    }

    Supports:
    - asks/bids
    - a/b
    - data.asks/data.bids
    - result.asks/result.bids
    """

    if depth is None:
        return None

    if not isinstance(depth, dict):
        return None

    nested = (
        depth.get("data")
        or depth.get("result")
        or depth
    )

    if not isinstance(nested, dict):
        return None

    asks = nested.get("asks") or nested.get("a")
    bids = nested.get("bids") or nested.get("b")

    if asks is None or bids is None:
        return None

    if not isinstance(asks, list):
        return None

    if not isinstance(bids, list):
        return None

    return {
        "asks": asks,
        "bids": bids,
    }


def _sum_side(side) -> float:

    total = 0.0

    for level in side[:TOP_LEVELS]:

        try:

            price = float(level[0])
            size = float(level[1])

            if price <= 0:
                continue

            if size <= 0:
                continue

            total += price * size

        except Exception:
            continue

    return total


def _depth_imbalance(depth: Any) -> Optional[float]:
    """
    Returns imbalance in range [-1, 1].

    +1 = maximum buy pressure
    0 = neutral
    -1 = maximum sell pressure
    """

    depth = _normalize_depth(depth)

    if depth is None:
        return None

    notional_asks = _sum_side(depth["asks"])
    notional_bids = _sum_side(depth["bids"])

    total = notional_asks + notional_bids

    if total <= 0:
        return None

    imbalance = (
        notional_bids - notional_asks
    ) / total

    return max(
        min(imbalance, 1.0),
        -1.0
    )


def _coverage(exchange_count: int) -> str:

    if exchange_count >= 4:
        return "high"

    if exchange_count >= 2:
        return "medium"

    if exchange_count >= 1:
        return "low"

    return "none"


def _signal(index: Optional[int]) -> str:

    if index is None:
        return "unknown"

    if index >= 70:
        return "bullish"

    if index <= 30:
        return "bearish"

    return "neutral"


def compute_whale_pressure(
    exchanges: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:

    imbalances = {}

    weighted_sum = 0.0
    total_weight = 0.0

    for name, data in exchanges.items():

        if not isinstance(data, dict):
            continue

        depth = data.get("depth")

        imbalance = _depth_imbalance(depth)

        if imbalance is None:
            continue

        imbalances[name] = round(
            imbalance,
            6
        )

        weight = DEFAULT_WEIGHTS.get(
            name.lower(),
            1.0
        )

        weighted_sum += imbalance * weight
        total_weight += weight

    exchange_count = len(imbalances)

    if total_weight == 0:
        aggregate = None
        index = None

    else:

        aggregate = (
            weighted_sum /
            total_weight
        )

        index = int(
            round(
                (aggregate + 1) * 50
            )
        )

        index = max(
            0,
            min(index, 100)
        )

    return {

        "schema_version":
            SCHEMA_VERSION,

        "per_exchange_imbalance":
            imbalances,

        "aggregate_imbalance":
            round(aggregate, 6)
            if aggregate is not None
            else None,

        "whale_pressure_index":
            index,

        "signal":
            _signal(index),

        "exchange_count":
            exchange_count,

        "coverage":
            _coverage(exchange_count),

        "top_levels_used":
            TOP_LEVELS,
    }
