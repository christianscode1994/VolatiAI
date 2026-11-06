from typing import Dict, Any, Optional


def _total_notional(
    depth: Dict[str, Any]
) -> Optional[float]:

    if not depth:
        return None

    asks = depth.get("asks") or depth.get("a") or []
    bids = depth.get("bids") or depth.get("b") or []

    total = 0.0

    for side in (asks, bids):

        for level in side:

            try:

                if len(level) < 2:
                    continue

                price = float(level[0])
                size = float(level[1])

                if price <= 0 or size <= 0:
                    continue

                total += price * size

            except (
                TypeError,
                ValueError,
                IndexError,
            ):
                continue

    return total if total > 0 else None


def compute_liquidity_snapshot(
    exchanges: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:

    totals = {}

    for name, data in exchanges.items():

        depth = (
            data.get("depth")
            if data
            else None
        )

        totals[name] = _total_notional(depth)

    valid = {
        k: v
        for k, v in totals.items()
        if v is not None
    }

    total_sum = sum(valid.values())

    shares = {
        k: round(v / total_sum, 6)
        for k, v in valid.items()
    } if total_sum > 0 else {}

    return {
        "status": (
            "ok"
            if valid
            else "unavailable"
        ),
        "exchange_count": len(valid),
        "notional_totals": totals,
        "liquidity_shares": shares,
    }
