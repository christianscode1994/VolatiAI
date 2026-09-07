import os
import json
import requests

TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_message(text):
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": CHAT_ID, "text": text})

def run():
    pro = json.load(open("private/pro.json"))
    scores = pro.get("scores", {})

    msg = (
        "📊 *VolatiAI Update*\n"
        f"Trend Index: {scores.get('trend_index')}\n"
        f"Liquidity Index: {scores.get('liquidity_index')}\n"
        f"AI/DePIN Narrative: {scores.get('narrative_index')}\n"
        f"Developer Sentiment: {scores.get('developer_sentiment_index')}\n"
    )

    send_message(msg)

if __name__ == "__main__":
    run()
