def explain_event(
    event,
    score,
    supports=None,
    contradictions=None,
):
    return {
        "event": event,
        "score": score,
        "supports": supports or [],
        "contradictions": contradictions or [],
    }
