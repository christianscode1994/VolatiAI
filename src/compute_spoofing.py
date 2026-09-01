# src/compute_spoofing.py

from typing import Dict, Any, List

def detect_spoofing(depth: Dict[str, Any], min_notional: float = 500_000.0) -> List[Dict[str, Any]]:
    """
    Very simple spoofing heuristic:
    - detect large walls (asks or bids) above min_notional
    - these are *potential* spoof levels, not guaranteed
    """
    if not depth:
        return []

    asks = depth.get("asks") or depth.get("a") or []
    bids = depth.get("bids") or depth.get("b") or []

    signals = []

    def _scan(side, side_name):
        for level in side:
            try:
                price = float(level[0])
                size = float(level[1])
                notional = price * size
            except (ValueError, TypeError, IndexError):
                continue

            if notional >= min_notional:
                signals.append({
                    "side": side_name,
                    "price": price,
                    "size": size,
                    "notional": notional,
                })

    _scan(asks, "ask")
    _scan(bids, "bid")

    return signals


def compute_spoofing_for_exchanges(exchanges: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    out = {}
    for name, data in exchanges.items():
        depth = data.get("depth") if data else None
        out[name] = detect_spoofing(depth)
    return out
