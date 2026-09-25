def classify_severity(value: float) -> str:
    if value >= 0.85:
        return "critical"
    if value >= 0.65:
        return "warning"
    if value >= 0.40:
        return "watch"
    return "info"
