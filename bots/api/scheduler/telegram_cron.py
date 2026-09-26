from volatai.bots.api.telegram_api import send_telegram
from volatai.bots.telegram.telegram_adapter import render_summary, render_events
from .base_scheduler import load_json

class TelegramScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_telegram(msg["target"], msg["content"], msg.get("visual"))

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_telegram(msg["target"], msg["content"], msg.get("visual"))
