"""
VolatiAI Broadcast Router
-------------------------
Routes autonomous intelligence signals from VolatiAI to all social platforms.

Place this file in:
    VolatiAI/VolatiAI/broadcast_router.py

Requires the following modules inside volatiai/:
    volatiai_slack.py
    volatiai_telegram.py
    volatiai_twitter.py
    volatiai_mastodon.py
    volatiai_bluesky.py
    volatiai_nostr.py
"""

from volatiai.volatiai_slack import slack_send
from volatiai.volatiai_telegram import telegram_send
from volatiai.volatiai_twitter import twitter_send
from volatiai.volatiai_mastodon import mastodon_send
from volatiai.volatiai_bluesky import bluesky_send
from volatiai.volatiai_nostr import nostr_send


def broadcast_social(text: str):
    """
    Broadcast a message to ALL social platforms.
    Merchant platforms are intentionally excluded.
    """
    try:
        slack_send(text)
    except Exception as e:
        print(f"[Slack Error] {e}")

    try:
        telegram_send(text)
    except Exception as e:
        print(f"[Telegram Error] {e}")

    try:
        twitter_send(text)
    except Exception as e:
        print(f"[Twitter Error] {e}")

    try:
        mastodon_send(text)
    except Exception as e:
        print(f"[Mastodon Error] {e}")

    try:
        bluesky_send(text)
    except Exception as e:
        print(f"[Bluesky Error] {e}")

    try:
        nostr_send(text)
    except Exception as e:
        print(f"[Nostr Error] {e}")


def broadcast_platform(platform: str, text: str):
    """
    Broadcast to a single platform by name.
    Useful for selective routing.
    """
    platform = platform.lower()

    if platform == "slack":
        return slack_send(text)
    if platform == "telegram":
        return telegram_send(text)
    if platform == "twitter":
        return twitter_send(text)
    if platform == "mastodon":
        return mastodon_send(text)
    if platform == "bluesky":
        return bluesky_send(text)
    if platform == "nostr":
        return nostr_send(text)

    raise ValueError(f"Unknown platform: {platform}")
