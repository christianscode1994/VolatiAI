import requests

BASE = "https://api.dexscreener.com/latest/dex"

def get_pairs_by_token(token_address: str):
    """
    Dexscreener: fetch all pairs for a given token.
    Returns list of pairs or empty list.
    """
    url = f"{BASE}/tokens/{token_address}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data.get("pairs", [])
