from .config import POSITIVE_WORDS, NEGATIVE_WORDS

def score_text(text: str) -> float:
    t = text.lower()
    score = 0
    for w in POSITIVE_WORDS:
        if w in t:
            score += 1
    for w in NEGATIVE_WORDS:
        if w in t:
            score -= 1
    return score


def compute_sentiment(reddit_titles, hn_titles):
    # Combine both sources
    combined = (reddit_titles or []) + (hn_titles or [])

    if not combined:
        return {
            "reddit": {"score": 0, "avg": 0, "count": 0},
            "hn": {"score": 0, "avg": 0, "count": 0},
            "combined": {"score": 0, "avg": 0, "count": 0},
        }

    # Individual scores
    reddit_scores = [score_text(t) for t in reddit_titles] if reddit_titles else []
    hn_scores = [score_text(t) for t in hn_titles] if hn_titles else []

    # Combined scores
    combined_scores = reddit_scores + hn_scores

    def pack(scores):
        if not scores:
            return {"score": 0, "avg": 0, "count": 0}
        total = sum(scores)
        avg = total / len(scores)
        return {"score": total, "avg": avg, "count": len(scores)}

    return {
        "reddit": pack(reddit_scores),
        "hn": pack(hn_scores),
        "combined": pack(combined_scores),
    }


def sentiment_label(avg_score: float) -> str:
    if avg_score > 0.5:
        return "bullish"
    if avg_score < -0.5:
        return "bearish"
    return "neutral"
