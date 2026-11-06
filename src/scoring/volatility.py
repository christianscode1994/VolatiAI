# src/scoring/volatility.py

from typing import Dict, Any


STABLECOINS = {
    "usdt",
    "usdc",
    "dai",
    "fdusd",
    "usde",
}


def volatility_score(
    payload: Dict[str, Any]
) -> float:

    assets = payload.get(
        "top_by_volatility",
        []
    )

    if not assets:
        return 0.0

    scores = []

    for asset in assets:

        symbol = (
            asset.get(
                "symbol",
                ""
            )
            .lower()
        )

        if symbol in STABLECOINS:
            continue

        change = abs(
            asset.get(
                "price_change_percentage_24h",
                0
            )
        )

        volume = (
            asset.get(
                "total_volume",
                0
            )
        )

        change_score = min(
            change * 10,
            100
        )

        volume_score = min(
            volume / 1e9 * 5,
            100
        )

        score = (
            change_score * 0.7
            + volume_score * 0.3
        )

        scores.append(score)

    if not scores:
        return 0.0

    return round(
        sum(scores) / len(scores),
        2
    )
