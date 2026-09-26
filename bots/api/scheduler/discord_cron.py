from volatai.bots.api.discord_api import send_discord
from volatai.bots.discord.discord_adapter import render_summary, render_events
from .base_scheduler import load_json

class DiscordScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_discord(msg["target"], msg["embed"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_discord(msg["target"], msg["embed"])
