from .config import POSITIVE_WORDS, NEGATIVE_WORDS


def score_text(text: str) -> float:
    """
    Simple keyword-based sentiment scoring.
    Positive word = +1
    Negative word = -1
    """

    if not isinstance(text, str):
        return 0.0

    t = text.lower()
    score = 0

    for word in POSITIVE_WORDS:
        if word in t:
            score += 1

    for word in NEGATIVE_WORDS:
        if word in t:
            score -= 1

    return float(score)


def compute_sentiment(titles):
    """
    Compute sentiment for a single list of titles.

    Returns:
    {
        "score": total_score,
        "avg": average_score,
        "count": item_count
    }
    """

    if not titles:
        return {
            "score": 0.0,
            "avg": 0.0,
            "count": 0,
        }

    scores = [
        score_text(title)
        for title in titles
    ]

    total = sum(scores)

    avg = (
        total / len(scores)
        if scores
        else 0.0
    )

    return {
        "score": round(float(total), 4),
        "avg": round(float(avg), 4),
        "count": len(scores),
    }


def sentiment_label(avg_score: float) -> str:
    """
    Convert average sentiment score to label.
    """

    if avg_score > 0.5:
        return "bullish"

    if avg_score < -0.5:
        return "bearish"

    return "neutral"
