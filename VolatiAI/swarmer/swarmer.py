import requests
import random
import time

from swarmer.microtasks.narrative_spike import detect_narrative_spike
from swarmer.microtasks.volatility_spike import detect_volatility_spike
from swarmer.microtasks.chain_health import detect_chain_health
from swarmer.microtasks.defi_shift import detect_defi_shift

# NEW microtasks
from swarmer.microtasks.anomaly import detect_anomaly
from swarmer.microtasks.chain_watch import chain_watch
from swarmer.microtasks.depin_route import depin_route

from swarmer.spawner import spawn_swarmer

AGENT_FEED_URL = "https://your-volata-endpoint/agent/feed"

MICROTASKS = [
    detect_narrative_spike,
    detect_volatility_spike,
    detect_chain_health,
    detect_defi_shift,
    detect_anomaly,      # NEW
    chain_watch,         # NEW
    depin_route,         # NEW
]

def run_swarmer():
    # 1. Pull intelligence
    intel = requests.get(AGENT_FEED_URL).json()

    # 2. Pick one micro-task
    task = random.choice(MICROTASKS)
    event = task(intel)

    # 3. Publish micro-event (stdout, bot, DePIN, etc.)
    print(event)

    # 4. Spawn next Swarmer
    spawn_swarmer()

    # 5. Terminate
    return
