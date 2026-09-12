GLOBAL_STATE = {
    "burst_block": False,
    "max_events_per_minute": 200,
}

def should_allow_publish(health_snapshot):
    if health_snapshot["events_per_minute"] > GLOBAL_STATE["max_events_per_minute"]:
        GLOBAL_STATE["burst_block"] = True
        return False

    GLOBAL_STATE["burst_block"] = False
    return True
