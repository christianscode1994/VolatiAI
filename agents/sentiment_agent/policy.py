import json
import time
from datetime import datetime

from src.tools_reddit import Reddit
from src.tools_hn import HackerNews
from src.offline import snap, mode

from src.compute_sentiment import compute_sentiment, sentiment_label


rd = Reddit()
hn = HackerNews()


# -----------------------------
# Safe wrappers
# -----------------------------

def safe_call(fn, default=None, retries=3, delay=0.8):
    for _ in range(retries):
        try:
            out = fn()
            if out:
                return out
        except Exception:
            pass
        time.sleep(delay)
    return default


def stamp(data, status):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "data": data
    }


# -----------------------------
# Scoring model
# -----------------------------

def score_sentiment(avg):
    # avg ∈ [-∞, ∞], but realistically [-3, 3]
    # map to 0–100
    return max(0, min(100, (avg + 3) * (100 / 6)))


def composite_score(sent):
    return round(sent, 2)


# -----------------------------
# Agent runtime
# -----------------------------

def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last_sentiment", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    # Fetch titles
    reddit_titles = safe_call(lambda: rd.top_titles(limit=50), default=[])
    hn_titles = safe_call(lambda: hn.top_titles(limit=50), default=[])

    status = {
        "reddit": "ok" if reddit_titles else "fail",
        "hn": "ok" if hn_titles else "fail"
    }

    # Compute sentiment
    sentiment = compute_sentiment(reddit_titles, hn_titles)

    avg = sentiment["combined"]["avg"]
    score = score_sentiment(avg)
    label = sentiment_label(avg)

    score_block = {
        "avg": avg,
        "score": score,
        "label": label,
        "composite": composite_score(score)
    }

    return {
        "snapshot": stamp(
            {
                "reddit": reddit_titles,
                "hn": hn_titles,
                "sentiment": sentiment
            },
            status
        ),
        "score": score_block
    }


def run_offline():
    return snap.get("last_sentiment", {
        "snapshot": {},
        "score": {}
    })


def write_outputs(data):
    import os
    os.makedirs("public", exist_ok=True)

    with open("public/sentiment.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
