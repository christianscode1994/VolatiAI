# src/compute_whales.py

from typing import Dict, Any, Optional

def _depth_imbalance(depth: Dict[str, Any]) -> Optional[float]:
    """
    Returns buy-side vs sell-side imbalance in [−1, 1].
    >0 = buy pressure, <0 = sell pressure.
    """
    if not depth:
        return None

    asks = depth.get("asks") or depth.get("a") or []
    bids = depth.get("bids") or depth.get("b") or []

    def _sum_side(side):
        total = 0.0
        for level in side:
            # Kraken: [price, volume, timestamp]
            # Binance: [price, volume, ...]
            # OKX/Bybit/Crypto.com: similar
            try:
                price = float(level[0])
                size = float(level[1])
                total += price * size
            except (ValueError, TypeError, IndexError):
                continue
        return total

    notional_asks = _sum_side(asks)
    notional_bids = _sum_side(bids)

    if notional_asks + notional_bids == 0:
        return None

    # normalized imbalance in [−1, 1]
    return (notional_bids - notional_asks) / (notional_bids + notional_asks)


def compute_whale_pressure(exchanges: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute a simple whale pressure index from multi-exchange depth.
    exchanges: {
      "kraken": {"depth": ...},
      "binance": {"depth": ...},
      ...
    }
    """
    imbalances = {}
    for name, data in exchanges.items():
        if not data:
            continue
        depth = data.get("depth")
        if depth:
            imbalances[name] = _depth_imbalance(depth)

    # aggregate
    valid = [v for v in imbalances.values() if v is not None]
    if not valid:
        agg = None
    else:
        agg = sum(valid) / len(valid)

    # map to 0–100 index (50 = neutral)
    if agg is None:
        index = None
    else:
        index = int((agg + 1) * 50)  # −1→0, 0→50, +1→100

    return {
        "per_exchange_imbalance": imbalances,
        "aggregate_imbalance": agg,
        "whale_pressure_index": index,
    }
