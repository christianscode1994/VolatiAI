# volatiai/src/compute_defi_alerts.py

def compute_defi_alerts(defi_health: dict) -> list[str]:
    if not defi_health:
        return ["defi_health_unavailable"]

    alerts = []

    score = defi_health.get("score", 0)
    if score < 0.3:
        alerts.append("defi_score_critical")
    elif score < 0.5:
        alerts.append("defi_score_degraded")

    if defi_health.get("aave_utilization", 0) > 0.85:
        alerts.append("aave_utilization_high")

    if abs(defi_health.get("dai_peg_deviation", 0)) > 0.01:
        alerts.append("dai_peg_deviation")

    if defi_health.get("curve_steth_imbalance", 0) > 0.05:
        alerts.append("curve_steth_imbalance")

    return alerts
