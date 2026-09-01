# src/compute_arbitrage.py

from typing import Dict, Any, Optional

def _extract_last_price(ticker: Any) -> Optional[float]:
    if ticker is None:
        return None

    # Kraken: ticker["c"][0]
    if isinstance(ticker, dict):
        if "c" in ticker and isinstance(ticker["c"], list):
            try:
                return float(ticker["c"][0])
            except (ValueError, TypeError):
                pass

        # Binance: dict with "bidPrice"/"askPrice" or "lastPrice"
        for key in ("lastPrice", "bidPrice", "askPrice", "price"):
            if key in ticker:
                try:
                    return float(ticker[key])
                except (ValueError, TypeError):
                    pass

        # Coinbase: "price"
        if "price" in ticker:
            try:
                return float(ticker["price"])
            except (ValueError, TypeError):
                pass

    return None


def compute_arbitrage_deltas(exchanges: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    prices = {}
    for name, data in exchanges.items():
        ticker = data.get("ticker") if data else None
        prices[name] = _extract_last_price(ticker)

    valid = {k: v for k, v in prices.items() if v is not None}
    if not valid:
        return {"prices": prices, "deltas": {}}

    min_ex = min(valid, key=valid.get)
    max_ex = max(valid, key=valid.get)

    deltas = {}
    base_price = valid[min_ex]
    for k, v in valid.items():
        deltas[k] = (v - base_price) / base_price if base_price > 0 else None

    return {
        "prices": prices,
        "base_exchange": min_ex,
        "max_exchange": max_ex,
        "deltas_vs_base": deltas,
    }
