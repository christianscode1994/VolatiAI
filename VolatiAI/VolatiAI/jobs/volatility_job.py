from detectors import detect_volatility_spike
from broadcast_router import broadcast_social

def run_volatility_job(intel):
    spike = detect_volatility_spike(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Volatility spike: {spike['value']:.3f}")
