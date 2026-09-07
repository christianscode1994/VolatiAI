def sentiment_score(sentiment_data):
    """
    sentiment_data: dict from sentiment_agent (pro_sentiment.json)
    Expected: counts of positive/negative/neutral posts from Reddit, HN, Nitter.
    Returns: 0–100 sentiment score (bullishness).
    """
    reddit = sentiment_data.get("reddit", {})
    hn = sentiment_data.get("hackernews", {})
    x = sentiment_data.get("nitter", {})

    pos = reddit.get("positive", 0) + hn.get("positive", 0) + x.get("positive", 0)
    neg = reddit.get("negative", 0) + hn.get("negative", 0) + x.get("negative", 0)
    total = max(pos + neg, 1)

    ratio = pos / total  # 0–1
    return round(ratio * 100, 2)
