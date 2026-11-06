import json
from .send_alert import send_alert

def run():
    hist = json.load(open("private/narratives_timeline.json"))
    if len(hist) < 2:
        return

    prev = hist[-2]
    curr = hist[-1]

    ai_delta = curr["ai_count"] - prev["ai_count"]
    depin_delta = curr["depin_count"] - prev["depin_count"]

    if ai_delta >= 10:
        send_alert(f"🤖 *AI Narrative Surge*\nAI keyword spike: *+{ai_delta}*")

    if depin_delta >= 10:
        send_alert(f"📡 *DePIN Narrative Surge*\nDePIN keyword spike: *+{depin_delta}*")
