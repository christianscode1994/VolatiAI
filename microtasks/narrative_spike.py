def detect_narrative_spike(intel):
    score = intel["signals"]["narrative"]
    return {
        "type": "narrative_spike",
        "value": score,
        "spike": score > 0.85
    }
