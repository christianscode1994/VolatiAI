# src/scoring/depth.py

from typing import Dict, Any


def depth_score(
    liquidity_data: Dict[str, Any]
) -> float:
    """
    Convert liquidity collector output
    into a normalized 0-100 score.
    """

    if not liquidity_data:
        return 0.0

    # New collector format
    score = liquidity_data.get(
        "score"
    )

    if isinstance(
        score,
        (int, float)
    ):
        return round(
            max(
                0.0,
                min(
                    float(score) * 100,
                    100.0
                )
            ),
            2
        )

    # Legacy format fallback

    bids = liquidity_data.get(
        "bids",
        []
    )

    asks = liquidity_data.get(
        "asks",
        []
    )

    try:

        bid_liq = sum(
            float(b[1])
            for b in bids[:20]
        )

        ask_liq = sum(
            float(a[1])
            for a in asks[:20]
        )

        total_liq = (
            bid_liq + ask_liq
        )

        return round(
            min(
                total_liq
                / 1000
                * 100,
                100
            ),
            2
        )

    except Exception:
        return 0.0
``
