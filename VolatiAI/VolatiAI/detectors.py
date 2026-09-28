def detect_volatility_spike(intel, threshold: float = 0.80):
    v = intel["signals"]["volatility"]
    return {"spike": v >= threshold, "value": v}

def detect_sentiment_spike(intel, threshold: float = 0.70):
    s = abs(intel["signals"]["sentiment"])
    return {"spike": s >= threshold, "value": s}

def detect_dev_activity_spike(intel, threshold: float = 0.75):
    d = intel["signals"]["dev_activity"]
    return {"spike": d >= threshold, "value": d}

def detect_exchange_depth_spike(intel, threshold: float = 0.75):
    e = intel["signals"]["exchange_depth"]
    return {"spike": e >= threshold, "value": e}

def detect_social_spike(intel, threshold: float = 0.75):
    s = intel["signals"]["social"]
    return {"spike": s >= threshold, "value": s}

def detect_anomaly(intel, threshold: float = 0.85):
    a = intel["signals"]["anomaly"]
    return {"spike": a >= threshold, "value": a}
