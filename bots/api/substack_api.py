import requests
import os

TOKEN = os.getenv("SUBSTACK_TOKEN")

def send_substack(title: str, body: str):
    url = "https://api.substack.com/api/v1/posts"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    requests.post(url, headers=headers, json={"title": title, "body": body})
