def channel_fatigue(channel_state):
    """
    channel_state example:
    {
        "last_messages": 120,
        "last_minute": 18,
        "admins_active": True
    }
    """

    # Too many messages recently
    if channel_state["last_messages"] > 100:
        return True

    # Too many messages in last minute
    if channel_state["last_minute"] > 10:
        return True

    # Admins watching → be quiet
    if channel_state["admins_active"]:
        return True

    return False
