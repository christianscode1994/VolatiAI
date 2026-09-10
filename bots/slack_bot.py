import os
import requests
from bots.bot_core import snapshot_intel

def run_slack_bot():
    snap = snapshot_intel()
    text = f"VolatiAI Snapshot {snap['timestamp']}\nScore: {snap['score']:.3f} ({snap['label']})"

    webhook = os.getenv("SLACK_WEBHOOK")
    requests.post(webhook, json={"text": text})
