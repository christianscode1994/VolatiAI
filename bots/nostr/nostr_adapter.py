def render_summary(summary: dict) -> list:
    content = (
        f"VolatiAI Daily Intelligence\n"
        f"{summary['summary_text']}\n"
        f"Trend: {summary['trend_accel']['score']:.2f}, "
        f"Whales: {summary['whale_pressure']['score']:.2f}"
    )
    return [{"type": "note", "content": content}]

def render_events(events: dict) -> list:
    notes = []
    for ev in events["events"]:
        content = (
            f"{ev['title']} [{ev['severity']}]\n"
            f"{ev['payload'].get('comment', '')}"
        )
        notes.append({"type": "note", "content": content})
    return notes
