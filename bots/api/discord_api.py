import requests
import os

TOKEN = os.getenv("DISCORD_TOKEN")

def send_discord(channel_id: str, embed: dict):
    url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
    headers = {"Authorization": f"Bot {TOKEN}"}
    requests.post(url, headers=headers, json={"embeds": [embed]})
