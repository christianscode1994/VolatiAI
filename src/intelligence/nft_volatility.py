import statistics
from src.fusion.nft_unified import unified_nft

def nft_volatility(chain: str, identifier: str) -> dict:
    nft = unified_nft(chain, identifier)
    activity = nft.get("activity") or []

    prices = []
    for evt in activity:
        p = evt.get("price") or evt.get("sale_price")
        if p is not None:
            prices.append(float(p))

    if len(prices) < 2:
        return {
            "samples": len(prices),
            "mean_price": 0.0,
            "stdev_price": 0.0,
            "volatility": 0.0,
        }

    mean = statistics.mean(prices)
    stdev = statistics.pstdev(prices)
    vol = stdev / mean if mean > 0 else 0.0

    return {
        "samples": len(prices),
        "mean_price": mean,
        "stdev_price": stdev,
        "volatility": vol,
    }
