# volatiai/src/compute_defi_health.py

def compute_defi_health(
    uniswap_data,
    sushiswap_data,
    curve_data,
    aave_data,
    maker_data,
):
    score_components = {
        "amm_liquidity_ok": uniswap_data is not None and sushiswap_data is not None,
        "stable_pool_ok": curve_data is not None,
        "lending_ok": aave_data is not None,
        "maker_ok": maker_data is not None,
    }
    score = sum(1 for v in score_components.values() if v) / len(score_components)
    return {"score": score, "components": score_components}


def compute_defi_health_from_snapshots(snapshots):
    """
    Wrapper used by src.main to compute DeFi health from a snapshot dictionary.
    Ensures compatibility with the import in main.py.
    """
    try:
        return compute_defi_health(
            snapshots.get("uniswap"),
            snapshots.get("sushiswap"),
            snapshots.get("curve"),
            snapshots.get("aave"),
            snapshots.get("maker"),
        )
    except Exception:
        return {"score": 0, "components": {}}
