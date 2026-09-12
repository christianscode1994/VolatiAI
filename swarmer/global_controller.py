GLOBAL_CONTROL = {
    "max_events_per_minute": 200,
    "global_block": False,
    "cluster_limits": {
        "narrative": 50,
        "market": 50,
        "chain": 50,
        "defi": 50,
        "anomaly": 50,
    }
}

def global_allow_publish(health, cluster):
    # Burst protection
    if health["events_per_minute"] > GLOBAL_CONTROL["max_events_per_minute"]:
        GLOBAL_CONTROL["global_block"] = True
        return False

    GLOBAL_CONTROL["global_block"] = False

    # Cluster balancing
    active = health["active_clusters"].get(cluster, 0)
    limit = GLOBAL_CONTROL["cluster_limits"].get(cluster, 50)

    if active > limit:
        return False

    return True
