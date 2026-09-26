import requests
import os

TOKEN = os.getenv("TWITTER_TOKEN")

def send_tweet(text: str):
    url = "https://api.twitter.com/2/tweets"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    requests.post(url, headers=headers, json={"text": text})
