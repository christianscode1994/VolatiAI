from .volatility import volatility_score
from .sentiment import sentiment_score
from .dsi import dsi_score
from .depth import depth_score

def compute_scores(market_data, sentiment_data, dev_data):
    vol = volatility_score(market_data)
    sent = sentiment_score(sentiment_data)
    dsi = dsi_score(dev_data)
    depth = depth_score(market_data)

    # simple composite indices
    trend_index = round(0.4 * vol + 0.3 * sent + 0.3 * dsi, 2)
    liquidity_index = depth

    return {
        "volatility_score": vol,
        "sentiment_score": sent,
        "developer_sentiment_index": dsi,
        "depth_score": depth,
        "trend_index": trend_index,
        "liquidity_index": liquidity_index
    }
