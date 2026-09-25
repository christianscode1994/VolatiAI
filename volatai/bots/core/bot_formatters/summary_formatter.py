from ..bot_severity import classify_severity

def build_summary(snapshot: dict) -> dict:
    return {
        "generated_at": snapshot["generated_at"],
        "summary_text": snapshot["summary_text"],
        "trend_accel": snapshot["trend_accel"],
        "narrative": snapshot["narrative"],
        "whale_pressure": snapshot["whale_pressure"],
        "spoofing_prob": snapshot["spoofing_prob"],
        "rpc_truth": snapshot["rpc_truth"],
        "dsi": snapshot["dsi"],
        "severity": classify_severity(snapshot["trend_accel"]["score"])
    }
