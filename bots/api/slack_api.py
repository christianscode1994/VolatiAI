import requests
import os

TOKEN = os.getenv("SLACK_TOKEN")

def send_slack(channel: str, text: str):
    url = "https://slack.com/api/chat.postMessage"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    requests.post(url, headers=headers, json={"channel": channel, "text": text})
