def specialize(intel):
    """
    Returns the best micro-task for the current signal profile.
    """

    scores = intel["signals"]

    if scores["narrative"] > 0.80:
        return "narrative_spike"

    if scores["market"] > 0.75:
        return "volatility_spike"

    if scores["chain_risk"] > 0.70:
        return "chain_watch"

    if scores["defi"] > 0.70:
        return "defi_shift"

    return "anomaly"
