def detect_anomaly(intel):
    return {
        "type": "anomaly",
        "narrative_spike": intel["signals"]["narrative"] > 0.85,
        "volatility_spike": intel["signals"]["market"] > 0.80,
        "risk_spike": intel["signals"]["risk"] > 0.75,
    }
