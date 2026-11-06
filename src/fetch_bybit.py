import time
import requests

BYBIT_API = "https://api.bybit.com/v5/market"


def _get(path: str, params: dict, retries: int = 3) -> dict:
    url = f"{BYBIT_API}/{path}"

    for attempt in range(retries):
        r = requests.get(url, params=params, timeout=10)

        if r.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue

        r.raise_for_status()
        body = r.json()

        code = body.get("retCode", -1)
        if code == 10006:                       # rate limit
            time.sleep(1.5 * (attempt + 1))
            continue
        if code != 0:
            raise RuntimeError(f"Bybit error {code}: {body.get('retMsg', '')}")

        return body.get("result", {})

    raise RuntimeError("Bybit: rate-limited after retries")


def bybit_ticker(symbol: str = "BTCUSDT") -> dict:
    result = _get("tickers", {"category": "spot", "symbol": symbol})
    listing = result.get("list", [])
    return listing[0] if listing else {}


def bybit_depth(symbol: str = "BTCUSDT", limit: int = 50) -> dict:
    return _get("orderbook", {
        "category": "spot",
        "symbol": symbol,
        "limit": str(limit),
    })
