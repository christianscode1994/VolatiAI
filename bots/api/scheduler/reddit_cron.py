from volatai.bots.api.reddit_api import send_reddit
from volatai.bots.reddit.reddit_adapter import render_summary, render_events
from .base_scheduler import load_json

class RedditScheduler:
    def daily(self):
        summary = load_json("bot_summary.json")
        messages = render_summary(summary)
        for msg in messages:
            send_reddit(msg["subreddit"], msg["title"], msg["body"])

    def events(self):
        events = load_json("bot_event.json")
        messages = render_events(events)
        for msg in messages:
            send_reddit(msg["subreddit"], msg["title"], msg["body"])
