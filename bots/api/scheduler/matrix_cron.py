from volatai.bots.api.matrix_api import send_matrix
from volatai.bots.matrix.matrix_adapter import render_summary, render_events
from .base_scheduler import load_json

class MatrixScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_matrix(msg["room"], msg["content"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_matrix(msg["room"], msg["content"])
