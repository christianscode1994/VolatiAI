import time
import requests

OKX_API = "https://www.okx.com/api/v5/market"


def _get(path: str, params: dict, retries: int = 3) -> list:
    url = f"{OKX_API}/{path}"

    for attempt in range(retries):
        r = requests.get(url, params=params, timeout=10)

        if r.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue

        r.raise_for_status()
        body = r.json()

        code = str(body.get("code", ""))
        if code == "50011":                       # rate limit
            time.sleep(1.5 * (attempt + 1))
            continue
        if code != "0":
            raise RuntimeError(f"OKX error {code}: {body.get('msg', '')}")

        return body.get("data", [])

    raise RuntimeError("OKX: rate-limited after retries")


def okx_ticker(inst: str = "BTC-USDT") -> dict:
    data = _get("ticker", {"instId": inst})
    return data[0] if data else {}


def okx_depth(inst: str = "BTC-USDT", limit: int = 50) -> dict:
    data = _get("books", {"instId": inst, "sz": str(limit)})
    return data[0] if data else {}
