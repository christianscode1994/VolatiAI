import os
import requests
from bots.bot_core import snapshot_intel

def run_whatsapp_bot():
    snap = snapshot_intel()
    text = f"VolatiAI Snapshot {snap['timestamp']}\nScore: {snap['score']:.3f} ({snap['label']})"

    url = f"https://graph.facebook.com/v18.0/{os.getenv('WA_PHONE_ID')}/messages"
    headers = {"Authorization": f"Bearer {os.getenv('WA_TOKEN')}"}

    data = {
        "messaging_product": "whatsapp",
        "to": os.getenv("WA_TO"),
        "type": "text",
        "text": {"body": text}
    }

    requests.post(url, headers=headers, json=data)
