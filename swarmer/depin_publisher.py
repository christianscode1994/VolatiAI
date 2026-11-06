import requests

DEPIN_ENDPOINT = "https://your-volata-endpoint/depin/publish"

def publish_depin(event):
    try:
        requests.post(DEPIN_ENDPOINT, json=event, timeout=3)
    except Exception:
        pass
