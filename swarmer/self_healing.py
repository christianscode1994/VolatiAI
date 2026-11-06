import time

def heal_rpc_failure(error_count):
    if error_count > 5:
        time.sleep(2)  # simple cooldown

def heal_platform_throttle(platform_state):
    if platform_state["global_load"] > 0.9:
        time.sleep(5)

def heal_bad_intel(intel_ok):
    if not intel_ok:
        time.sleep(1)
