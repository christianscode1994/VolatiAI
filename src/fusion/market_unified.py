# from src.market.cex import get_cex_depth
# from src.market.dex import get_dex_depth
# from src.market.oracle import get_oracle_price

def unified_market(asset: str) -> dict:
    """
    asset: symbol or address (e.g. 'SOL', 'ETH', 'BTC', or contract)
    """
    return {
        "oracle_price": None,  # get_oracle_price(asset)
        "cex_depth": None,     # get_cex_depth(asset)
        "dex_depth": None,     # get_dex_depth(asset),
    }
