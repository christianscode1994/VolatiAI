import json
from pathlib import Path
from datetime import datetime

def run():
    pro = json.load(open("private/pro.json"))
    scores = pro.get("scores", {})

    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "volatility": scores.get("volatility_score"),
        "sentiment": scores.get("sentiment_score"),
        "dsi": scores.get("developer_sentiment_index")
    }

    path = Path("private/trends_history.json")
    history = []
    if path.exists():
        history = json.loads(path.read_text())
    history.append(snapshot)
    path.write_text(json.dumps(history, indent=2))

    if len(history) >= 2:
        prev, curr = history[-2], history[-1]
        accel = {
            "volatility_accel": curr["volatility"] - prev["volatility"],
            "sentiment_accel": curr["sentiment"] - prev["sentiment"],
            "dsi_accel": curr["dsi"] - prev["dsi"]
        }
        Path("private/trends_accel.json").write_text(json.dumps(accel, indent=2))

if __name__ == "__main__":
    run()
