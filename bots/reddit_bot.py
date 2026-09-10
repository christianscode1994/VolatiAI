import os
import praw
from bots.bot_core import snapshot_intel

def format_reddit_post(snap):
    u = snap["uio"]
    return (
        f"[VolatiAI Snapshot] {snap['timestamp']}\n\n"
        f"Global score: {snap['score']:.3f} ({snap['label']})\n\n"
        f"- Developer: {u['developer']['scores']['developer_score']:.3f}\n"
        f"- Market:    {u['market']['scores']['market_score']:.3f}\n"
        f"- DeFi:      {u['defi']['scores']['defi_score']:.3f}\n"
        f"- NFT:       {u['nft']['scores']['nft_score']:.3f}\n"
        f"- Narrative: {u['narrative']['scores']['narrative_score']:.3f}\n"
        f"- Risk:      {u['risk']['scores']['risk_score']:.3f}\n"
    )

def run_reddit_bot():
    snap = snapshot_intel()
    body = format_reddit_post(snap)

    reddit = praw.Reddit(
        client_id=os.getenv("REDDIT_CLIENT_ID"),
        client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
        user_agent="VolatiAI-bot",
        username=os.getenv("REDDIT_USER"),
        password=os.getenv("REDDIT_PASS"),
    )

    subreddit = reddit.subreddit("your_subreddit_here")
    subreddit.submit(title=f"VolatiAI Snapshot {snap['timestamp']}", selftext=body)
