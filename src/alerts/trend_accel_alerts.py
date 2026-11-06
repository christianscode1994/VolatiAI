import json
from .send_alert import send_alert

def run():
    accel = json.load(open("private/trends_accel.json"))

    vol = accel.get("volatility_accel", 0)
    sent = accel.get("sentiment_accel", 0)
    dsi = accel.get("dsi_accel", 0)

    if vol > 5:
        send_alert(f"📈 *Trend Acceleration*\nVolatility accelerating: *{vol:+.2f}*")

    if sent > 5:
        send_alert(f"📈 *Trend Acceleration*\nSentiment accelerating: *{sent:+.2f}*")

    if dsi > 5:
        send_alert(f"📈 *Trend Acceleration*\nDeveloper activity accelerating: *{dsi:+.2f}*")
