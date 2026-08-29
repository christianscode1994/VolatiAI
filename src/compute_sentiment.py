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

def compute_sentiment(titles):
    if not titles:
        return {"score": 0, "avg": 0, "count": 0}
    scores = [score_text(t) for t in titles]
    total = sum(scores)
    avg = total / len(scores)
    return {"score": total, "avg": avg, "count": len(scores)}

def sentiment_label(avg_score: float) -> str:
    if avg_score > 0.5:
        return "bullish"
    if avg_score < -0.5:
        return "bearish"
    return "neutral"
