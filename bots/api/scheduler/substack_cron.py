from volatai.bots.api.substack_api import send_substack
from volatai.bots.substack.substack_adapter import render_summary, render_events
from .base_scheduler import load_json

class SubstackScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_substack(msg["title"], msg["body"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_substack(msg["title"], msg["body"])
