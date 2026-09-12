def assign_cluster(instance_id):
    """
    Simple deterministic cluster assignment.
    """
    clusters = ["narrative", "market", "chain", "defi", "anomaly"]
    return clusters[instance_id % len(clusters)]
