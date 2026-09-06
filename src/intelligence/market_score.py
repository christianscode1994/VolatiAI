from src.fusion.market_unified import unified_market

def norm(x, max_val):
    if x is None:
        return 0.0
    return min(1.0, max(0.0, x / max_val))

def market_score(asset: str) -> dict:
    market = unified_market(asset)

    oracle_price = market.get("oracle_price")
    cex_depth = market.get("cex_depth") or {}
    dex_depth = market.get("dex_depth") or {}

    # placeholders: you can replace with real depth metrics
    cex_liquidity = cex_depth.get("liquidity", 0)
    dex_liquidity = dex_depth.get("liquidity", 0)

    cex_score = norm(cex_liquidity, 1_000_000)
    dex_score = norm(dex_liquidity, 1_000_000)

    stability_score = 0.5  # placeholder for oracle stability

    final = (
        0.35 * cex_score +
        0.35 * dex_score +
        0.30 * stability_score
    )

    return {
        "cex_score": cex_score,
        "dex_score": dex_score,
        "stability_score": stability_score,
        "final_score": final,
        "oracle_price": oracle_price,
    }
