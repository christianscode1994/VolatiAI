import time

HEALTH_STATE = {
    "last_update": None,
    "events_per_minute": 0,
    "blocked_publishes": 0,
    "active_clusters": {},
}

def update_health(event, cluster, blocked=False):
    now_minute = int(time.time() / 60)
    HEALTH_STATE["last_update"] = now_minute

    HEALTH_STATE["events_per_minute"] += 0 if blocked else 1
    if blocked:
        HEALTH_STATE["blocked_publishes"] += 1

    HEALTH_STATE["active_clusters"][cluster] = (
        HEALTH_STATE["active_clusters"].get(cluster, 0) + 1
    )

def snapshot_health():
    return dict(HEALTH_STATE)
