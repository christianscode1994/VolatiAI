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


def _score_titles(titles):
    """
    Internal: score a single list of titles.
    Returns a flat {score, avg, count} block.
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
    avg = total / len(scores) if scores else 0.0

    return {
        "score": round(float(total), 4),
        "avg": round(float(avg), 4),
        "count": len(scores),
    }


def compute_sentiment(hn_titles=None):
    """
    Compute sentiment from available sources.

    Sources: hn (only). Reddit removed.

    Returns:
    {
        "hn":       {score, avg, count},
        "combined": {score, avg, count}
    }
    """

    hn_titles = hn_titles or []

    hn_block = _score_titles(hn_titles)

    # Only average sources that actually returned data.
    present = []
    if hn_block["count"]:
        present.append(hn_block["avg"])

    combined_avg = (
        sum(present) / len(present)
        if present
        else 0.0
    )

    combined_block = {
        "score": round(float(sum(present)), 4) if present else 0.0,
        "avg": round(float(combined_avg), 4),
        "count": hn_block["count"],
    }

    return {
        "hn": hn_block,
        "combined": combined_block,
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
