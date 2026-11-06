def detect_volatility_spike(intel):
    score = intel["signals"]["market"]
    return {
        "type": "volatility_spike",
        "value": score,
        "spike": score > 0.80
    }
