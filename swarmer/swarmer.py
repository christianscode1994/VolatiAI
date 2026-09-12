import requests
import random
import time
import os

# Microtasks
from swarmer.microtasks.narrative_spike import detect_narrative_spike
from swarmer.microtasks.volatility_spike import detect_volatility_spike
from swarmer.microtasks.chain_health import detect_chain_health
from swarmer.microtasks.defi_shift import detect_defi_shift
from swarmer.microtasks.anomaly import detect_anomaly
from swarmer.microtasks.chain_watch import chain_watch
from swarmer.microtasks.depin_route import depin_route

# Self-regulation modules
from swarmer.governor import swarm_governor
from swarmer.platform_limits import platform_throttle
from swarmer.fatigue import channel_fatigue
from swarmer.stability import stability_check
from swarmer.specialize import specialize

# Swarm-level intelligence modules
from swarmer.memory import remember_event, is_repeated_pattern
from swarmer.coordination import register_task, release_task, should_run_task
from swarmer.backpressure import backpressure
from swarmer.clustering import assign_cluster
from swarmer.specialization_pools import pool_for_cluster

# NEW: Health, healing, analytics, orchestration
from swarmer.health_dashboard import update_health, snapshot_health
from swarmer.self_healing import heal_rpc_failure, heal_platform_throttle, heal_bad_intel
from swarmer.analytics import record_task, record_cluster
from swarmer.orchestrator import should_allow_publish

# Infrastructure modules
from swarmer.rpc_refresh import refresh_rpcs
from swarmer.logger import log_event
from swarmer.depin_publisher import publish_depin
from swarmer.batcher import add_to_batch, flush_batch

from swarmer.spawner import spawn_swarmer

AGENT_FEED_URL = "https://your-volata-endpoint/agent/feed"

TASK_MAP = {
    "narrative_spike": detect_narrative_spike,
    "volatility_spike": detect_volatility_spike,
    "chain_health": detect_chain_health,
    "defi_shift": detect_defi_shift,
    "anomaly": detect_anomaly,
    "chain_watch": chain_watch,
    "depin_route": depin_route,
}

def run_swarmer():
    # 0. Refresh RPC endpoints (avoid rate limits)
    refresh_rpcs()

    # 1. Pull intelligence
    try:
        intel = requests.get(AGENT_FEED_URL).json()
        intel_ok = "signals" in intel and "platform_state" in intel
    except Exception:
        heal_rpc_failure(error_count=10)
        return

    heal_bad_intel(intel_ok)
    if not intel_ok:
        return

    # 2. Backpressure (global load protection)
    if backpressure(intel):
        heal_platform_throttle(intel["platform_state"])
        update_health(event=None, cluster="unknown", blocked=True)
        return

    # 3. Self-regulation checks
    if not swarm_governor(intel):
        update_health(event=None, cluster="unknown", blocked=True)
        return

    if not platform_throttle(intel["platform_state"]):
        update_health(event=None, cluster="unknown", blocked=True)
        return

    if channel_fatigue(intel["channel_state"]):
        update_health(event=None, cluster="unknown", blocked=True)
        return

    if not stability_check(intel):
        update_health(event=None, cluster="unknown", blocked=True)
        return

    # 4. Swarm identity
    instance_id = int(os.environ.get("SWARM_INSTANCE_ID", random.randint(1, 100000)))

    # 5. Clustering (assign swarm role)
    cluster = assign_cluster(instance_id)
    record_cluster(cluster)

    # 6. Specialization pools (role → allowed tasks)
    pool = pool_for_cluster(cluster)

    # 7. Coordination (avoid too many swarmers doing same task)
    candidate_tasks = [t for t in pool if should_run_task(t)]
    if not candidate_tasks:
        update_health(event=None, cluster=cluster, blocked=True)
        return

    # 8. Specialize micro-task selection
    task_name = random.choice(candidate_tasks)
    record_task(task_name)

    # 9. Anti-repeat (avoid spam patterns)
    if is_repeated_pattern(task_name, threshold=15, window_seconds=900):
        update_health(event=None, cluster=cluster, blocked=True)
        return

    # 10. Register task
    register_task(task_name, instance_id)

    # 11. Execute micro-task
    task = TASK_MAP[task_name]
    event = task(intel)

    # 12. Global orchestration check
    health = snapshot_health()
    if not should_allow_publish(health):
        update_health(event=None, cluster=cluster, blocked=True)
        release_task(instance_id)
        return

    # 13. Memory
    remember_event(event)

    # 14. Batch + log + publish
    add_to_batch(event)
    flush_batch()
    log_event(event)
    publish_depin(event)

    # 15. Update health dashboard
    update_health(event, cluster, blocked=False)

    # 16. Release coordination lock
    release_task(instance_id)

    # 17. Spawn next Swarmer
    spawn_swarmer()

    # 18. Terminate
    return
