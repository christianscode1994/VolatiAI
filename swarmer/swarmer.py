import requests
import random
import time

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
    intel = requests.get(AGENT_FEED_URL).json()

    # 2. Self-regulation checks
    if not swarm_governor(intel):
        return

    if not platform_throttle(intel["platform_state"]):
        return

    if channel_fatigue(intel["channel_state"]):
        return

    if not stability_check(intel):
        return

    # 3. Specialize micro-task selection
    task_name = specialize(intel)
    task = TASK_MAP[task_name]

    # 4. Execute micro-task
    event = task(intel)

    # 5. Batch + log + publish
    add_to_batch(event)
    flush_batch()
    log_event(event)
    publish_depin(event)

    # 6. Spawn next Swarmer
    spawn_swarmer()

    # 7. Terminate
    return
