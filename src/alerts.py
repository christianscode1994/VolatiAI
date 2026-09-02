# src/alerts.py

import json
import os
import requests

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_alert(message: str):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception:
        pass


def load_data(path: str):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def alert_whale_pressure(data):
    wpi = data.get("whale_pressure_index")
    if wpi is None:
        return
    if wpi > 70:
        send_alert(f"🐋 *Whale Pressure Spike*: Index {wpi}")


def alert_spoofing(data):
    spoof = data.get("spoofing_score")
    if spoof and spoof > 0.7:
        send_alert(f"🎭 *Spoofing Detected*: Score {spoof:.2f}")


def alert_liquidity(data):
    mig = data.get("liquidity_migration")
    if mig and abs(mig) > 0.15:
        send_alert(f"💧 *Liquidity Migration*: {mig*100:.1f}% shift")


def alert_arbitrage(data):
    arb = data.get("arbitrage_delta")
    if arb and abs(arb) > 0.5:
        send_alert(f"🔀 *Arbitrage Opportunity*: {arb:.2f}% delta")


def alert_volatility(data):
    vol = data.get("volatility_score")
    if vol and vol > 2.0:
        send_alert(f"⚡ *Volatility Breakout*: Score {vol:.2f}")


def alert_sentiment(data):
    r = data.get("sentiment_reddit")
    h = data.get("sentiment_hn")
    if r is None or h is None:
        return
    if abs(r - h) > 0.3:
        send_alert(f"🧠 *Sentiment Divergence*: Reddit {r:.2f}, HN {h:.2f}")


def alert_dev_activity(data):
    dsi = data.get("developer_sentiment_index")
    if dsi and dsi > 70:
        send_alert(f"💻 *Developer Activity Surge*: DSI {dsi}")


def run_alerts():
    # Load Pro data (alerts should use Pro tier)
    data = load_data("private/pro.json")
    if not data:
        return

    alert_whale_pressure(data)
    alert_spoofing(data)
    alert_liquidity(data)
    alert_arbitrage(data)
    alert_volatility(data)
    alert_sentiment(data)
    alert_dev_activity(data)


if __name__ == "__main__":
    run_alerts()
