from .base_scheduler import build_daily_messages, build_event_messages
from volatai.bots.nostr.nostr_adapter import render_summary, render_events

class NostrScheduler:
    def daily(self):
        return build_daily_messages(adapter=self)

    def events(self):
        return build_event_messages(adapter=self)

    def render_summary(self, summary):
        return render_summary(summary)

    def render_events(self, events):
        return render_events(events)
