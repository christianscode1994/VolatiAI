import os
import json
import requests

SECRET = os.getenv("NOSTR_SECRET")

def send_nostr(relay: str, content: str):
    event = {
        "kind": 1,
        "content": content,
        "tags": [],
    }
    requests.post(relay, json=event)
