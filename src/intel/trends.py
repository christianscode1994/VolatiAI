import json
from pathlib import Path
from datetime import datetime

MAX_HISTORY = 1000


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def run():
    data = load_json("private/pro.json")
    scores = data.get("scores", {})

    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "volatility": scores.get("volatility_score", 0),
        "sentiment": scores.get("sentiment_score", 0),
        "dsi": scores.get("developer_sentiment_index", 0)
    }

    path = Path("private/trends_history.json")

    history = []

    if path.exists():
        try:
            history = json.loads(path.read_text(encoding="utf-8"))

            if not isinstance(history, list):
                history = []

        except Exception:
            history = []

    history.append(snapshot)

    # Prevent unlimited growth
    history = history[-MAX_HISTORY:]

    path.write_text(
        json.dumps(history, indent=2),
        encoding="utf-8"
    )

    if len(history) >= 2:
        prev = history[-2]
        curr = history[-1]

        accel = {
            "volatility_accel": (
                curr.get("volatility", 0)
                - prev.get("volatility", 0)
            ),
            "sentiment_accel": (
                curr.get("sentiment", 0)
                - prev.get("sentiment", 0)
            ),
            "dsi_accel": (
                curr.get("dsi", 0)
                - prev.get("dsi", 0)
            ),
            "timestamp": curr["timestamp"]
        }

        Path("private/trends_accel.json").write_text(
            json.dumps(accel, indent=2),
            encoding="utf-8"
        )

    return snapshot


if __name__ == "__main__":
    run()
