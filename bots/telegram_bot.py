import os
import requests
from bots.bot_core import snapshot_intel

def run_telegram_bot():
    snap = snapshot_intel()
    text = f"VolatiAI Snapshot {snap['timestamp']}\nScore: {snap['score']:.3f} ({snap['label']})"

    url = f"https://api.telegram.org/bot{os.getenv('TG_TOKEN')}/sendMessage"
    requests.post(url, data={"chat_id": os.getenv("TG_CHAT"), "text": text})
