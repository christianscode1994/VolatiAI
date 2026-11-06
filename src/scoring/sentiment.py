# src/scoring/sentiment.py

from typing import Dict, Any


def sentiment_score(
    sentiment_data: Dict[str, Any]
) -> float:
    """
    Computes a 0-100 sentiment score using
    available source averages.

    Supported sources:
    - hn
    - pushshift
    """

    scores = []

    for source in (
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

    # avg is documented as roughly [-3, 3] elsewhere in the codebase,
    # so normalize over that range instead of [-1, 1].
    normalized = (
        (average_sentiment + 3)
        / 6
    ) * 100

    normalized = max(
        0,
        min(100, normalized)
    )

    return round(
        normalized,
        2,
    )
