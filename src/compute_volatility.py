import math

def compute_volatility_for_coin(coin):
    keys = [
        "price_change_percentage_1h_in_currency",
        "price_change_percentage_24h_in_currency",
        "price_change_percentage_7d_in_currency",
    ]
    values = [coin.get(k) for k in keys if coin.get(k) is not None]
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return math.sqrt(var)

def compute_volatility_summary(coins):
    out = []
    for c in coins:
        vol = compute_volatility_for_coin(c)
        out.append({
            "id": c["id"],
            "name": c["name"],
            "symbol": c["symbol"],
            "current_price": c["current_price"],
            "market_cap": c["market_cap"],
            "volatility": vol,
            "price_change_1h": c.get("price_change_percentage_1h_in_currency"),
            "price_change_24h": c.get("price_change_percentage_24h_in_currency"),
            "price_change_7d": c.get("price_change_percentage_7d_in_currency"),
        })
    out.sort(key=lambda x: x["volatility"], reverse=True)
    return out
