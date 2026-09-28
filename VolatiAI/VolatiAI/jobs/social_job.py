from detectors import detect_social_spike
from broadcast_router import broadcast_social

def run_social_job(intel):
    spike = detect_social_spike(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Social activity spike: {spike['value']:.3f}")
