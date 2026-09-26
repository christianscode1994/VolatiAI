from volatai.bots.api.whatsapp_api import send_whatsapp
from volatai.bots.whatsapp.whatsapp_adapter import render_summary, render_events
from .base_scheduler import load_json

class WhatsAppScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_whatsapp(msg["to"], msg["content"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_whatsapp(msg["to"], msg["content"])
