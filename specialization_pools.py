def pool_for_cluster(cluster):
    if cluster == "narrative":
        return ["narrative_spike", "anomaly"]
    if cluster == "market":
        return ["volatility_spike", "anomaly"]
    if cluster == "chain":
        return ["chain_watch", "chain_health"]
    if cluster == "defi":
        return ["defi_shift", "depin_route"]
    if cluster == "anomaly":
        return ["anomaly"]
    return ["anomaly"]
