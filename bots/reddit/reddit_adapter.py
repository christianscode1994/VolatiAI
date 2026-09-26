def render_summary(summary: dict) -> list:
    title = "VolatiAI Daily Intelligence Snapshot"
    body = (
        f"{summary['summary_text']}\n\n"
        f"- Trend Accel: {summary['trend_accel']['score']:.2f}\n"
        f"- Whale Pressure: {summary['whale_pressure']['score']:.2f}\n"
        f"- Spoofing Prob: {summary['spoofing_prob']['score']:.2f}\n"
        f"- RPC Truth: {summary['rpc_truth']['score']:.2f}\n"
        f"- Dev Velocity: {summary['dsi']['score']:.2f}\n"
    )
    return [{"type": "post", "title": title, "content": body}]

def render_events(events: dict) -> list:
    posts = []
    for ev in events["events"]:
        body = (
            f"{ev['title']} ({ev['severity']})\n\n"
            f"{ev['payload'].get('comment', '')}"
        )
        posts.append({"type": "comment", "content": body})
    return posts
