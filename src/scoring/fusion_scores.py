from .volatility import volatility_score
from .sentiment import sentiment_score
from .dsi import dsi_score
from .depth import depth_score


def compute_scores(
    payload,
    sentiment_data,
    dev_data
):
    vol = volatility_score(payload)

    sent = sentiment_score(
        sentiment_data
    )

    dsi = dsi_score(
        dev_data
    )

    depth = depth_score(
        payload
    )

    trend_index = round(
        0.4 * vol +
        0.3 * sent +
        0.3 * dsi,
        2
    )

    liquidity_index = round(
        depth,
        2
    )

    return {
        "volatility_score": vol,
        "sentiment_score": sent,
        "developer_sentiment_index": dsi,
        "depth_score": depth,
        "trend_index": trend_index,
        "liquidity_index": liquidity_index,
    }
