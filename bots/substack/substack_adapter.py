def render_summary(summary: dict) -> list:
    title = "VolatiAI Daily Intelligence Report"
    body = (
        f"# VolatiAI Daily Intelligence\n\n"
        f"{summary['summary_text']}\n\n"
        f"## Metrics\n"
        f"- Trend Accel: {summary['trend_accel']['score']:.2f}\n"
        f"- Whale Pressure: {summary['whale_pressure']['score']:.2f}\n"
        f"- Spoofing Prob: {summary['spoofing_prob']['score']:.2f}\n"
        f"- RPC Truth: {summary['rpc_truth']['score']:.2f}\n"
        f"- Dev Velocity: {summary['dsi']['score']:.2f}\n"
    )
    return [{"type": "article", "title": title, "content": body}]

def render_events(events: dict) -> list:
    sections = []
    for ev in events["events"]:
        section = f"### {ev['title']} ({ev['severity']})\n{ev['payload'].get('comment', '')}\n"
        sections.append(section)
    return [{"type": "article_section", "content": "\n".join(sections)}]
