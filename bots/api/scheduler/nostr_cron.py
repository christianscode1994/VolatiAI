from volatai.bots.api.nostr_api import send_nostr
from volatai.bots.nostr.nostr_adapter import render_summary, render_events
from .base_scheduler import load_json

class NostrScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_nostr(msg["relay"], msg["content"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_nostr(msg["relay"], msg["content"])
