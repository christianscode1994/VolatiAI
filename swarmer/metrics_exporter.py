import json
from swarmer.analytics import TASK_COUNTER, CLUSTER_COUNTER
from swarmer.health_dashboard import snapshot_health

def export_metrics():
    return {
        "tasks": dict(TASK_COUNTER),
        "clusters": dict(CLUSTER_COUNTER),
        "health": snapshot_health(),
    }

def export_metrics_json():
    return json.dumps(export_metrics(), indent=2)
