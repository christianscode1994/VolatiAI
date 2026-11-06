import random
import time

def swarm_governor(intel):
    """
    Returns True if the swarmer is allowed to publish.
    Returns False if it should stay silent.
    """

    # 1. Avoid spam: only publish if signal strength is meaningful
    if intel["master"]["fused_score"] < 0.25:
        return False

    # 2. Avoid channel fatigue: random cooldown
    if random.random() < 0.15:  # 15% chance to skip
        return False

    # 3. Avoid overload: limit high-frequency spikes
    if intel["signals"]["narrative"] > 0.90 and random.random() < 0.50:
        return False

    # 4. Avoid admin pushback: avoid bursts
    current_minute = int(time.time() / 60)
    if current_minute % 10 == 0:  # every 10th minute, reduce noise
        return False

    # 5. Perfect compliance: avoid risky patterns
    if intel["signals"]["risk"] > 0.85:
        return False

    return True
