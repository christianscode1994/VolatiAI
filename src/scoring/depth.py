def depth_score(market_data):
    """
    Uses multi-exchange depth (Kraken, Binance, etc.) to compute a 0–100 liquidity score.
    """
    btc = market_data.get("btc", {})
    kr = btc.get("kraken", {})
    # you’ll add binance, coinbase, etc.

    bids = kr.get("bids", [])
    asks = kr.get("asks", [])

    bid_liq = sum(b[1] for b in bids[:20]) if bids else 0
    ask_liq = sum(a[1] for a in asks[:20]) if asks else 0
    total_liq = bid_liq + ask_liq

    return min(total_liq / 1000 * 100, 100)  # tune this
