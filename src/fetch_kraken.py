import requests
from .config import KRAKEN_PAIR

KRAKEN_API = "https://api.kraken.com/0/public"


def _kraken_get(path: str, params: dict) -> dict:
    """Shared GET with proper error handling."""
    r = requests.get(f"{KRAKEN_API}{path}", params=params, timeout=10)
    r.raise_for_status()
    body = r.json()

    if body.get("error"):
        raise RuntimeError(f"Kraken error: {body['error']}")

    return body.get("result", {})


def _first_pair(result: dict) -> dict:
    """Kraken keys results by pair name; strip 'last' and return the pair block."""
    result = {k: v for k, v in result.items() if k != "last"}
    if not result:
        return {}
    return result[next(iter(result))]


def _normalize(pair: str) -> str:
    """Kraken wants XBTUSD, not XBT/USD."""
    return pair.replace("/", "").replace("-", "").upper()


def kraken_ticker(pair: str = KRAKEN_PAIR):
    result = _kraken_get("/Ticker", {"pair": _normalize(pair)})
    return _first_pair(result)


def kraken_depth(pair: str = KRAKEN_PAIR, count: int = 20):
    result = _kraken_get("/Depth", {"pair": _normalize(pair), "count": count})
    return _first_pair(result)


def kraken_ohlc(pair: str = KRAKEN_PAIR, interval: int = 15):
    result = _kraken_get("/OHLC", {"pair": _normalize(pair), "interval": interval})

    last = result.get("last")
    candles_block = {k: v for k, v in result.items() if k != "last"}

    if not candles_block:
        return {"candles": [], "last": last}

    candles = candles_block[next(iter(candles_block))]
    return {"candles": candles, "last": last}
