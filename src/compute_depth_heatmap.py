# src/compute_depth_heatmap.py

from typing import Dict, Any, List

def build_depth_buckets(depth: Dict[str, Any], bucket_size: float = 100.0) -> List[Dict[str, Any]]:
    """
    Very simple bucketed depth:
    - group notional by price bucket (e.g. 100 USD wide)
    """
    if not depth:
        return []

    asks = depth.get("asks") or depth.get("a") or []
    bids = depth.get("bids") or depth.get("b") or []

    buckets = {}

    def _add(side, side_name):
        for level in side:
            try:
                price = float(level[0])
                size = float(level[1])
                notional = price * size
            except (ValueError, TypeError, IndexError):
                continue

            bucket = int(price // bucket_size) * bucket_size
            key = (side_name, bucket)
            buckets[key] = buckets.get(key, 0.0) + notional

    _add(asks, "ask")
    _add(bids, "bid")

    out = []
    for (side, bucket), notional in sorted(buckets.items(), key=lambda x: x[0][1]):
        out.append({
            "side": side,
            "bucket_price": bucket,
            "notional": notional,
        })

    return out


def compute_depth_heatmaps(exchanges: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    out = {}
    for name, data in exchanges.items():
        depth = data.get("depth") if data else None
        out[name] = build_depth_buckets(depth)
    return out
