def platform_throttle(platform_state):
    if platform_state["discord_rate"] > 0.60:
        return False
    if platform_state["telegram_rate"] > 0.60:
        return False
    if platform_state["reddit_rate"] > 0.80:
        return False
    return True
