def build_alerts(snapshot: dict) -> dict:
    alerts = []

    if snapshot["whale_pressure"]["score"] >= 0.85:
        alerts.append({
            "id": "whale-pressure",
            "type": "whale_pressure",
            "title": "Whale Pressure Spike",
            "severity": "critical",
            "details": snapshot["whale_pressure"]
        })

    if snapshot["rpc_truth"]["score"] <= 0.60:
        alerts.append({
            "id": "rpc-divergence",
            "type": "rpc_truth",
            "title": "RPC Truth Divergence",
            "severity": "warning",
            "details": snapshot["rpc_truth"]
        })

    return {
        "generated_at": snapshot["generated_at"],
        "alerts": alerts
    }
