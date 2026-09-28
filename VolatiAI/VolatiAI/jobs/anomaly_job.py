from detectors import detect_anomaly
from broadcast_router import broadcast_social

def run_anomaly_job(intel):
    spike = detect_anomaly(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Anomaly detected: {spike['value']:.3f}")
