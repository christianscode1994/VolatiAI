from .bot_severity import classify_severity

def build_event(name: str, score: float, payload: dict, visual: str) -> dict:
    return {
        "type": name,
        "title": name.replace("_", " ").title(),
        "severity": classify_severity(score),
        "payload": payload,
        "visual": visual
    }
