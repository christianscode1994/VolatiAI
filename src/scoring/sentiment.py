# src/scoring/sentiment.py

from typing import Dict, Any


def sentiment_score(
    sentiment_data: Dict[str, Any]
) -> float:
    """
    Computes a 0-100 sentiment score using
    available source averages.

    Supported sources:
    - reddit
    - hn
    - pushshift
    """

    scores = []

    for source in (
        "reddit",
        "hn",
        "pushshift",
    ):

        block = sentiment_data.get(
            source,
            {}
        )

        if not isinstance(block, dict):
            continue

        avg = block.get("avg")

        if isinstance(
            avg,
            (int, float),
        ):
            scores.append(
                float(avg)
            )

    if not scores:
        return 50.0

    average_sentiment = (
        sum(scores)
        / len(scores)
    )

    normalized = (
        (average_sentiment + 1)
        / 2
    ) * 100

    normalized = max(
        0,
        min(100, normalized)
    )

    return round(
        normalized,
        2,
    )
