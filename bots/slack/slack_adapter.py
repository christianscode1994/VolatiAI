def render_summary(summary: dict) -> list:
    text = (
        f"*VolatiAI Daily Intelligence*\n"
        f"{summary['summary_text']}\n\n"
        f"*Trend:* {summary['trend_accel']['score']:.2f}\n"
        f"*Whales:* {summary['whale_pressure']['score']:.2f}\n"
        f"*Spoofing:* {summary['spoofing_prob']['score']:.2f}\n"
        f"*RPC Truth:* {summary['rpc_truth']['score']:.2f}\n"
        f"*Dev Velocity:* {summary['dsi']['score']:.2f}\n"
    )
    return [{"type": "text", "content": text}]

def render_events(events: dict) -> list:
    msgs = []
    for ev in events["events"]:
        text = (
            f"*{ev['title']}* ({ev['severity']})\n"
            f"{ev['payload'].get('comment', '')}"
        )
        msgs.append({"type": "text", "content": text, "visual": ev["visual"]})
    return msgs
