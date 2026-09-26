from volatai.bots.api.twitter_api import send_tweet
from volatai.bots.twitter.twitter_adapter import render_summary, render_events
from .base_scheduler import load_json

class TwitterScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_tweet(msg["content"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_tweet(msg["content"])
