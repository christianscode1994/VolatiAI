from detectors import detect_exchange_depth_spike
from broadcast_router import broadcast_social

def run_exchange_depth_job(intel):
    spike = detect_exchange_depth_spike(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Exchange depth spike: {spike['value']:.3f}")
