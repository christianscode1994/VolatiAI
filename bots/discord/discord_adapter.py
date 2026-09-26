def render_summary(summary: dict) -> list:
    embed = {
        "title": "VolatiAI Daily Intelligence",
        "description": summary["summary_text"],
        "fields": [
            {"name": "Trend Accel", "value": str(summary["trend_accel"]["score"]), "inline": True},
            {"name": "Whale Pressure", "value": str(summary["whale_pressure"]["score"]), "inline": True},
            {"name": "Spoofing Prob", "value": str(summary["spoofing_prob"]["score"]), "inline": True},
            {"name": "RPC Truth", "value": str(summary["rpc_truth"]["score"]), "inline": True},
            {"name": "Dev Velocity", "value": str(summary["dsi"]["score"]), "inline": True},
        ]
    }
    return [{"type": "embed", "content": embed}]

def render_events(events: dict) -> list:
    msgs = []
    for ev in events["events"]:
        embed = {
            "title": ev["title"],
            "description": ev["payload"].get("comment", ""),
            "fields": [
                {"name": "Severity", "value": ev["severity"], "inline": True}
            ],
            "image": {"url": ev["visual"]}
        }
        msgs.append({"type": "embed", "content": embed})
    return msgs
