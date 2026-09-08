import json
from .send_alert import send_alert

def run():
    micro = json.load(open("private/microstructure.json"))
    whales = micro.get("whale_orders", [])

    if not whales:
        return

    biggest = max(whales, key=lambda w: w[1])
    size = biggest[1]

    if size >= 50:
        send_alert(f"🐋 *Whale Pressure Alert*\nLargest detected order: *{size} BTC*")
