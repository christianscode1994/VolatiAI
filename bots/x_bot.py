import os
import tweepy  # or requests to X API
from bots.bot_core import snapshot_intel

def format_x_post(snap):
    return (
        f"VolatiAI snapshot [{snap['timestamp']}]\n"
        f"Global score: {snap['score']:.3f} ({snap['label']})\n"
        f"Developer↑ Market↑ DeFi↑ NFT↑ Narrative↑ Risk→"
    )

def run_x_bot():
    snap = snapshot_intel()
    text = format_x_post(snap)

    client = tweepy.Client(bearer_token=os.getenv("X_BEARER"))
    client.create_tweet(text=text)
