from collections import Counter

TASK_COUNTER = Counter()
CLUSTER_COUNTER = Counter()

def record_task(task_name):
    TASK_COUNTER[task_name] += 1

def record_cluster(cluster):
    CLUSTER_COUNTER[cluster] += 1

def top_tasks(n=5):
    return TASK_COUNTER.most_common(n)

def top_clusters(n=5):
    return CLUSTER_COUNTER.most_common(n)
