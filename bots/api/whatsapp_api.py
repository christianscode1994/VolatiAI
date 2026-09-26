import requests
import os

TOKEN = os.getenv("WHATSAPP_TOKEN")

def send_whatsapp(to: str, text: str):
    url = "https://graph.facebook.com/v17.0/messages"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    requests.post(url, headers=headers, json={
        "messaging_product": "whatsapp",
        "to": to,
        "text": {"body": text}
    })
