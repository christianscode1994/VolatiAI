from typing import Dict, Any


STABLECOINS = {
    "usdt",
    "usdc",
    "dai",
    "fdusd",
    "usde",
    "tusd",
    "usdp",
}


def clamp(
    value: float,
    minimum: float = 0.0,
    maximum: float = 100.0
) -> float:
    return max(
        minimum,
        min(maximum, value)
    )


# --------------------------------------------------
# Sentiment
# --------------------------------------------------

def sentiment_score(
    payload: Dict[str, Any]
) -> float:

    sentiment = payload.get(
        "sentiment",
        {}
    )

    averages = []

    for source in (
        "reddit",
        "hn",
        "pushshift"
    ):

        block = sentiment.get(
            source,
            {}
        )

        avg = block.get("avg")

        if isinstance(
            avg,
            (int, float)
        ):
            averages.append(
                float(avg)
            )

    if not averages:
        return 50.0

    avg_sentiment = (
        sum(averages)
        / len(averages)
    )

    score = (
        (avg_sentiment + 1)
        / 2
    ) * 100

    return round(
        clamp(score),
        2
    )


# --------------------------------------------------
# Volatility
# --------------------------------------------------

def volatility_score(
    payload: Dict[str, Any]
) -> float:

    assets = payload.get(
        "top_by_volatility",
        []
    )

    values = []

    for asset in assets:

        if not isinstance(
            asset,
            dict
        ):
            continue

        symbol = (
            asset.get(
                "symbol",
                ""
            )
            .lower()
            .strip()
        )

        if symbol in STABLECOINS:
            continue

        change = abs(
            float(
                asset.get(
                    "price_change_percentage_24h",
                    0
                )
            )
        )

        values.append(change)

    if not values:
        return 0.0

    avg_change = (
        sum(values)
        / len(values)
    )

    score = clamp(
        avg_change * 10
    )

    return round(
        score,
        2
    )


# --------------------------------------------------
# Liquidity
# --------------------------------------------------

def liquidity_score(
    payload: Dict[str, Any]
) -> float:

    liquidity = payload.get(
        "liquidity"
    )

    if not isinstance(
        liquidity,
        dict
    ):
        return 0.0

    score = liquidity.get(
        "score"
    )

    if not isinstance(
        score,
        (int, float)
    ):
        return 0.0

    return round(
        clamp(
            score * 100
        ),
        2
    )


# --------------------------------------------------
# Onchain
# --------------------------------------------------

def onchain_score(
    payload: Dict[str, Any]
) -> float:

    health = (
        payload
        .get("onchain", {})
        .get(
            "chain_health",
            {}
        )
    )

    score = health.get(
        "health_score",
        0
    )

    if not isinstance(
        score,
        (int, float)
    ):
        return 0.0

    return round(
        clamp(float(score)),
        2
    )


# --------------------------------------------------
# Composite
# --------------------------------------------------

def compute_scores(
    payload: Dict[str, Any]
) -> Dict[str, float]:

    vol = volatility_score(
        payload
    )

    sent = sentiment_score(
        payload
    )

    liq = liquidity_score(
        payload
    )

    chain = onchain_score(
        payload
    )

    trend_index = round(
        (
            vol * 0.40
            + sent * 0.30
            + chain * 0.30
        ),
        2
    )

    market_index = round(
        (
            vol * 0.30
            + sent * 0.20
            + liq * 0.30
            + chain * 0.20
        ),
        2
    )

    return {
        "volatility_score": vol,
        "sentiment_score": sent,
        "liquidity_score": liq,
        "onchain_score": chain,
        "trend_index": trend_index,
        "market_index": market_index,
    }
