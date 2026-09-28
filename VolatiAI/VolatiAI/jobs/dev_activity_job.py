from detectors import detect_dev_activity_spike
from broadcast_router import broadcast_social

def run_dev_activity_job(intel):
    spike = detect_dev_activity_spike(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Dev activity spike: {spike['value']:.3f}")
