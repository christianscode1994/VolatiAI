import random
from datetime import datetime

def generate_intel():
    """
    Stub VolatiAI engine.
    Replace with your real pipeline later.
    """
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "signals": {
            "volatility": random.uniform(0, 1),
            "sentiment": random.uniform(-1, 1),
            "dev_activity": random.uniform(0, 1),
            "exchange_depth": random.uniform(0, 1),
            "social": random.uniform(0, 1),
            "anomaly": random.uniform(0, 1),
        },
    }
