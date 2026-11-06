import json
from pathlib import Path
from datetime import datetime

KEYWORDS_AI = [
    "ai",
    "ml",
    "machine learning",
    "llm",
    "gpt",
    "rag"
]

KEYWORDS_DEPIN = [
    "depin",
    "helium",
    "iot",
    "physical network",
    "sensor",
    "edge compute"
]

MAX_HISTORY = 1000


def load(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def count_keywords(texts, keywords):
    if not isinstance(texts, list):
        return 0

    text = " ".join(str(t) for t in texts).lower()
    return sum(text.count(keyword) for keyword in keywords)


def run():
    sentiment = load("private/pro_sentiment.json")
    dev = load("private/pro_developer.json")

    sentiment_texts = sentiment.get("texts", [])
    dev_texts = dev.get("texts", [])

    texts = sentiment_texts + dev_texts

    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "ai_count": count_keywords(texts, KEYWORDS_AI),
        "depin_count": count_keywords(texts, KEYWORDS_DEPIN),
        "text_count": len(texts)
    }

    path = Path("private/narratives_timeline.json")

    history = []

    if path.exists():
        try:
            history = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(history, list):
                history = []
        except Exception:
            history = []

    history.append(snapshot)

    # Prevent unlimited file growth
    history = history[-MAX_HISTORY:]

    path.write_text(
        json.dumps(history, indent=2),
        encoding="utf-8"
    )

    return snapshot


if __name__ == "__main__":
    run()
