# volatiai/src/defi_scoring.py

def score_defi(
    uniswap_liquidity: float,
    sushiswap_liquidity: float,
    curve_stability: float,
    aave_utilization: float,
    dai_peg_deviation: float,
) -> float:
    # weights: tune later
    w_uni = 0.2
    w_sushi = 0.1
    w_curve = 0.3
    w_aave = 0.2
    w_dai = 0.2

    # normalize: higher is better, except utilization & peg deviation
    aave_term = max(0.0, 1.0 - aave_utilization)      # high util → lower score
    dai_term = max(0.0, 1.0 - abs(dai_peg_deviation)) # big deviation → lower score

    score = (
        w_uni * uniswap_liquidity +
        w_sushi * sushiswap_liquidity +
        w_curve * curve_stability +
        w_aave * aave_term +
        w_dai * dai_term
    )

    return max(0.0, min(1.0, score))
