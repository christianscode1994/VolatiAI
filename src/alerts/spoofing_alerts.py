import json
from .send_alert import send_alert

def run():
    micro = json.load(open("private/microstructure.json"))
    score = micro.get("spoofing_score", 0)

    if score >= 70:
        send_alert(f"⚠️ *Spoofing Warning*\nSpoofing probability: *{score:.1f}%*")
