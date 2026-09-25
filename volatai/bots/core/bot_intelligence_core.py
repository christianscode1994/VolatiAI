import json
from pathlib import Path

from .bot_formatters.summary_formatter import build_summary
from .bot_formatters.alert_formatter import build_alerts
from .bot_formatters.timeline_formatter import build_timeline
from .bot_formatters.event_formatter import build_events

PUBLIC_DIR = Path("public")

def load_snapshot() -> dict:
    with open(PUBLIC_DIR / "intel.json", "r") as f:
        return json.load(f)

def write_output(name: str, data: dict):
    with open(PUBLIC_DIR / name, "w") as f:
        json.dump(data, f, indent=2)

def build_bot_outputs() -> None:
    snapshot = load_snapshot()

    write_output("bot_summary.json", build_summary(snapshot))
    write_output("bot_alert.json", build_alerts(snapshot))
    write_output("bot_timeline.json", build_timeline(snapshot))
    write_output("bot_event.json", build_events(snapshot))
