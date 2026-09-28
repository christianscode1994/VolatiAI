from detectors import detect_sentiment_spike
from broadcast_router import broadcast_social

def run_sentiment_job(intel):
    spike = detect_sentiment_spike(intel)
    if spike["spike"]:
        broadcast_social(f"[VolatiAI] Sentiment spike: {spike['value']:.3f}")
