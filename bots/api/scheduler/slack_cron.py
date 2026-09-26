from volatai.bots.api.slack_api import send_slack
from volatai.bots.slack.slack_adapter import render_summary, render_events
from .base_scheduler import load_json

class SlackScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_slack(msg["channel"], msg["content"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_slack(msg["channel"], msg["content"])
