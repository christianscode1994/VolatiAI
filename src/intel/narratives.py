import json
from pathlib import Path
from datetime import datetime

KEYWORDS_AI = ["ai", "ml", "machine learning", "llm", "gpt", "rag"]
KEYWORDS_DEPIN = ["depin", "helium", "iot", "physical network", "sensor", "edge compute"]

def load(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def count_keywords(texts, keywords):
    text = " ".join(texts).lower()
    return sum(text.count(k) for k in keywords)

def run():
    sentiment = load("private/pro_sentiment.json")
    dev = load("private/pro_developer.json")

    texts = sentiment.get("texts", []) + dev.get("texts", [])
    ai_count = count_keywords(texts, KEYWORDS_AI)
    depin_count = count_keywords(texts, KEYWORDS_DEPIN)

    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "ai_count": ai_count,
        "depin_count": depin_count
    }

    path = Path("private/narratives_timeline.json")
    history = []
    if path.exists():
        history = json.loads(path.read_text())
    history.append(snapshot)
    path.write_text(json.dumps(history, indent=2))

if __name__ == "__main__":
    run()
