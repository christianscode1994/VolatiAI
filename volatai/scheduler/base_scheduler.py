import json
from pathlib import Path

PUBLIC_DIR = Path("public")

def load_json(name: str) -> dict:
    with open(PUBLIC_DIR / name, "r") as f:
        return json.load(f)

def build_daily_messages(adapter):
    summary = load_json("bot_summary.json")
    return adapter.render_summary(summary)

def build_event_messages(adapter):
    events = load_json("bot_event.json")
    return adapter.render_events(events)
