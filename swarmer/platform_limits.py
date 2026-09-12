def platform_throttle(platform_state):
    """
    platform_state example:
    {
        "discord_rate": 0.40,
        "telegram_rate": 0.10,
        "reddit_rate": 0.70
    }
    """

    # If any platform is stressed, reduce swarm output
    if platform_state["discord_rate"] > 0.60:
        return False

    if platform_state["telegram_rate"] > 0.50:
        return False

    if platform_state["reddit_rate"] > 0.80:
        return False

    return True
