# src/fusion/nft_volatility.py

import statistics
from src.fusion.nft_unified import unified_nft

def nft_volatility(chain: str, identifier: str) -> dict:
    data = unified_nft(chain, identifier)
    activity = data.get("activity", []) or []

    prices = []
    for evt in activity:
        p = evt.get("price") or evt.get("sale_price")
        if p is not None:
            prices.append(float(p))

    if len(prices) < 2:
        return {
            "chain": chain,
            "identifier": identifier,
            "volatility": 0.0,
            "samples": len(prices),
        }

    mean = statistics.mean(prices)
    stdev = statistics.pstdev(prices)
    vol = stdev / mean if mean > 0 else 0.0

    return {
        "chain": chain,
        "identifier": identifier,
        "mean_price": mean,
        "stdev_price": stdev,
        "volatility": vol,
        "samples": len(prices),
    }
