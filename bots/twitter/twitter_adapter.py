def render_summary(summary: dict) -> list:
    text = (
        f"VolatiAI Daily Intelligence 🧠\n"
        f"{summary['summary_text']}\n\n"
        f"Trend: {summary['trend_accel']['score']:.2f} | "
        f"Whales: {summary['whale_pressure']['score']:.2f} | "
        f"Spoofing: {summary['spoofing_prob']['score']:.2f}"
    )
    return [{"type": "tweet", "content": text}]

def render_events(events: dict) -> list:
    tweets = []
    for ev in events["events"]:
        text = (
            f"{ev['title']} ({ev['severity']})\n"
            f"{ev['payload'].get('comment', '')}"
        )
        tweets.append({"type": "tweet", "content": text, "visual": ev["visual"]})
    return tweets
