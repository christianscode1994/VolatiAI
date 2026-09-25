from ..bot_event_builder import build_event

def build_events(snapshot: dict) -> dict:
    events = []

    events.append(build_event(
        "trend",
        snapshot["trend_accel"]["score"],
        snapshot["trend_accel"],
        "https://your-static/charts/trend.png"
    ))

    events.append(build_event(
        "narrative",
        snapshot["narrative"]["strength"],
        snapshot["narrative"],
        "https://your-static/charts/narrative.png"
    ))

    events.append(build_event(
        "whale_pressure",
        snapshot["whale_pressure"]["score"],
        snapshot["whale_pressure"],
        "https://your-static/charts/whale_pressure.png"
    ))

    events.append(build_event(
        "spoofing_prob",
        snapshot["spoofing_prob"]["score"],
        snapshot["spoofing_prob"],
        "https://your-static/charts/spoofing_prob.png"
    ))

    events.append(build_event(
        "rpc_truth",
        snapshot["rpc_truth"]["score"],
        snapshot["rpc_truth"],
        "https://your-static/charts/rpc_truth.png"
    ))

    events.append(build_event(
        "dsi",
        snapshot["dsi"]["score"],
        snapshot["dsi"],
        "https://your-static/charts/dsi.png"
    ))

    return {
        "generated_at": snapshot["generated_at"],
        "events": events
    }
