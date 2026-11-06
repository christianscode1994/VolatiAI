# src/compute_spoofing.py

from typing import Dict, Any, List, Optional

SCHEMA_VERSION = "2.0"

DEFAULT_MIN_NOTIONAL = 500_000.0


def _normalize_depth(
    depth: Any
) -> Optional[Dict[str, Any]]:
    """
    Normalize exchange depth.

    Supported:

    {
        "asks": [...]
        "bids": [...]
    }

    {
        "a": [...]
        "b": [...]
    }

    {
        "data": {
            ...
        }
    }

    {
        "result": {
            ...
        }
    }
    """

    if depth is None:
        return None

    if not isinstance(depth, dict):
        return None

    depth = (
        depth.get("data")
        or depth.get("result")
        or depth
    )

    if not isinstance(depth, dict):
        return None

    asks = depth.get("asks") or depth.get("a")
    bids = depth.get("bids") or depth.get("b")

    if not isinstance(asks, list):
        return None

    if not isinstance(bids, list):
        return None

    return {
        "asks": asks,
        "bids": bids
    }


def _scan_side(
    levels: List[Any],
    side_name: str,
    min_notional: float
) -> List[Dict[str, Any]]:

    signals = []

    for level in levels:

        try:

            price = float(level[0])
            size = float(level[1])

            if price <= 0:
                continue

            if size <= 0:
                continue

            notional = price * size

        except Exception:
            continue

        if notional < min_notional:
            continue

        signals.append({

            "side": side_name,

            "price": price,

            "size": size,

            "notional": round(
                notional,
                2
            ),

            "severity":
                "high"
                if notional >
                min_notional * 5
                else "medium"
        })

    return signals


def detect_spoofing(
    depth: Dict[str, Any],
    min_notional: float = DEFAULT_MIN_NOTIONAL
) -> List[Dict[str, Any]]:
    """
    Detect large orderbook walls that
    could represent spoofing.

    Stateless snapshot-based detection.
    """

    depth = _normalize_depth(depth)

    if depth is None:
        return []

    signals = []

    signals.extend(

        _scan_side(
            depth["asks"],
            "ask",
            min_notional
        )
    )

    signals.extend(

        _scan_side(
            depth["bids"],
            "bid",
            min_notional
        )
    )

    return sorted(
        signals,
        key=lambda x: x["notional"],
        reverse=True
    )


def _signals_to_score(
    signal_count: int,
    max_notional: float
) -> int:

    score = 0

    score += min(
        signal_count * 10,
        50
    )

    score += min(
        max_notional /
        5_000_000 * 50,
        50
    )

    return max(
        0,
        min(int(score), 100)
    )


def compute_spoofing_for_exchanges(
    exchanges: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:

    per_exchange = {}

    total_signals = 0

    largest_notional = 0.0

    for name, data in exchanges.items():

        if not isinstance(data, dict):
            continue

        depth = data.get("depth")

        signals = detect_spoofing(depth)

        per_exchange[name] = signals

        total_signals += len(signals)

        if signals:

            largest_notional = max(
                largest_notional,

                max(
                    s["notional"]
                    for s in signals
                )
            )

    spoofing_score = _signals_to_score(
        total_signals,
        largest_notional
    )

    if spoofing_score >= 80:
        signal = "high"

    elif spoofing_score >= 60:
        signal = "moderate"

    else:
        signal = "low"

    return {

        "schema_version":
            SCHEMA_VERSION,

        "per_exchange":
            per_exchange,

        "signal_count":
            total_signals,

        "largest_notional":
            round(
                largest_notional,
                2
            ),

        "spoofing_score":
            spoofing_score,

        "risk":
            signal
    }
