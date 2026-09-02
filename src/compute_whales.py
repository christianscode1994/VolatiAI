# src/compute_whales.py

from typing import Dict, Any, Optional

def _normalize_depth(depth: Any) -> Optional[Dict[str, Any]]:
    """
    Normalize depth data from any exchange into:
    {
        "asks": [...],
        "bids": [...]
    }

    Returns None if depth is unusable.
    """

    # If depth is None → skip
    if depth is None:
        return None

    # If depth is already a dict with asks/bids → good
    if isinstance(depth, dict):
        asks = depth.get("asks") or depth.get("a")
        bids = depth.get("bids") or depth.get("b")

        # If dict but missing keys → unusable
        if asks is None or bids is None:
            return None

        return {"asks": asks, "bids": bids}

    # If depth is a list → some exchanges return raw lists
    # Example: [["price", "size"], ...]
    if isinstance(depth, list):
        # We cannot know which side is asks/bids → skip
        return None

    # Anything else → skip
    return None


def _depth_imbalance(depth: Any) -> Optional[float]:
    """
    Returns buy-side vs sell-side imbalance in [−1, 1].
    >0 = buy pressure, <0 = sell pressure.
    """

    depth = _normalize_depth(depth)
    if depth is None:
        return None

    asks = depth["asks"]
    bids = depth["bids"]

    def _sum_side(side):
        total = 0.0
        for level in side:
            try:
                price = float(level[0])
                size = float(level[1])
                total += price * size
            except Exception:
                continue
        return total

    notional_asks = _sum_side(asks)
    notional_bids = _sum_side(bids)

    if notional_asks + notional_bids == 0:
        return None

    return (notional_bids - notional_asks) / (notional_bids + notional_asks)


def compute_whale_pressure(exchanges: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute whale pressure index from multi-exchange depth.
    """

    imbalances = {}

    for name, data in exchanges.items():
        if not isinstance(data, dict):
            continue

        depth = data.get("depth")
        imbalance = _depth_imbalance(depth)

        imbalances[name] = imbalance

    valid = [v for v in imbalances.values() if v is not None]

    if not valid:
        agg = None
    else:
        agg = sum(valid) / len(valid)

    if agg is None:
        index = None
    else:
        index = int((agg + 1) * 50)  # −1→0, 0→50, +1→100

    return {
        "per_exchange_imbalance": imbalances,
        "aggregate_imbalance": agg,
        "whale_pressure_index": index,
    }
