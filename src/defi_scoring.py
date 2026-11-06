# volatiai/src/defi_scoring.py

def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _norm_log(value: float, cap: float) -> float:
    """
    Log-normalize a positive USD-scale value to [0, 1].
    cap = the value that should map to ~1.0 (e.g. $1B).
    """
    import math
    if value is None or value <= 0:
        return 0.0
    return _clamp01(math.log10(1 + value) / math.log10(1 + cap))


def score_defi(
    uniswap_liquidity: float,      # USD, e.g. 5_000_000_000
    sushiswap_liquidity: float,    # USD
    curve_stability: float,        # [0, 1] already normalized
    aave_utilization: float,       # [0, 1] fraction (0.75 = 75%)
    dai_peg_deviation: float,      # [0, 1] abs fractional deviation (0.002 = 0.2%)
) -> float:
    """
    Returns a DeFi health score in [0, 1]. Higher = healthier.

    Liquidity inputs are USD-scale and log-normalized internally.
    curve_stability, aave_utilization, dai_peg_deviation must already
    be in [0, 1]; they are clamped to protect against bad callers.
    """

    # Guard against None / wrong types at the boundary
    uniswap_liquidity   = uniswap_liquidity   or 0.0
    sushiswap_liquidity = sushiswap_liquidity or 0.0
    curve_stability     = curve_stability     or 0.0
    aave_utilization    = aave_utilization    or 0.0
    dai_peg_deviation   = dai_peg_deviation   or 0.0

    # Normalize the USD-scale inputs (log scale, cap = $1B)
    uni_norm    = _norm_log(uniswap_liquidity,   cap=1_000_000_000)
    sushi_norm  = _norm_log(sushiswap_liquidity, cap=1_000_000_000)
    curve_norm  = _clamp01(curve_stability)

    # Invertible terms
    aave_term = _clamp01(1.0 - _clamp01(aave_utilization))
    dai_term  = _clamp01(1.0 - _clamp01(abs(dai_peg_deviation)))

    # Weights sum to 1.0
    w_uni, w_sushi, w_curve = 0.2, 0.1, 0.3
    w_aave, w_dai = 0.2, 0.2

    score = (
        w_uni   * uni_norm   +
        w_sushi * sushi_norm +
        w_curve * curve_norm +
        w_aave  * aave_term  +
        w_dai   * dai_term
    )

    return round(_clamp01(score), 4)
