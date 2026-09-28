import os
import requests

SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN")
SLACK_CHANNEL_ID = os.getenv("SLACK_CHANNEL_ID")

def slack_send(text: str):
    if not SLACK_BOT_TOKEN or not SLACK_CHANNEL_ID:
        print("Slack credentials missing")
        return

    url = "https://slack.com/api/chat.postMessage"
    headers = {
        "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {"channel": SLACK_CHANNEL_ID, "text": text}

    r = requests.post(url, headers=headers, json=payload)
    print("Slack response:", r.text)
    return r.json()
