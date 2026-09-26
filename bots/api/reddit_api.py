import requests
import os

TOKEN = os.getenv("REDDIT_TOKEN")

def send_reddit(subreddit: str, title: str, body: str):
    url = f"https://oauth.reddit.com/r/{subreddit}/submit"
    headers = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "VolatiAI/1.0"}
    requests.post(url, headers=headers, data={"title": title, "text": body, "kind": "self"})
