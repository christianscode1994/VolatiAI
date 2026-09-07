def volatility_score(market_data):
    """
    market_data: dict from market_agent (pro_market.json)
    Expected fields: btc prices, 24h change, volume, etc.
    Returns: 0–100 volatility score.
    """
    btc = market_data.get("btc", {})
    cg = btc.get("coingecko", {})
    cp = btc.get("coinpaprika", {})

    # simple example: combine 24h change and volume
    change = abs(cg.get("market_data", {}).get("price_change_percentage_24h", 0))
    volume = cg.get("market_data", {}).get("total_volume", {}).get("usd", 0)

    # normalize (you’ll tune these)
    change_score = min(change / 10 * 100, 100)      # 10% → 100
    volume_score = min(volume / 1e9 * 100, 100)     # 1B → 100

    return round(0.6 * change_score + 0.4 * volume_score, 2)
