import requests

BASE = "https://api.llama.fi"

def get_token_tvl(token_address: str, chain: str = "ethereum"):
    """
    DefiLlama: TVL for a specific token on a specific chain.
    Returns None if token not tracked.
    """
    url = f"{BASE}/tvl/{chain}:{token_address}"
    resp = requests.get(url, timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()

def get_protocols():
    """
    DefiLlama: list of all protocols.
    """
    resp = requests.get(f"{BASE}/protocols", timeout=10)
    resp.raise_for_status()
    return resp.json()
