def backpressure(intel):
    """
    Example fields:
    intel["platform_state"]["global_load"]
    intel["platform_state"]["discord_rate"]
    """
    ps = intel["platform_state"]

    if ps["global_load"] > 0.85:
        return True

    if ps["discord_rate"] > 0.70:
        return True

    if ps["telegram_rate"] > 0.70:
        return True

    return False
