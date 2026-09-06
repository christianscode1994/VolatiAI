import requests

BASE = "https://api-mainnet.magiceden.dev/v2"

def me_get(path):
    url = f"{BASE}/{path}"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()
