import requests
import os

TOKEN = os.getenv("TELEGRAM_TOKEN")

def send_telegram(chat_id: str, text: str, image: str | None = None):
    if image:
        url = f"https://api.telegram.org/bot{TOKEN}/sendPhoto"
        requests.post(url, data={"chat_id": chat_id, "caption": text}, files={"photo": requests.get(image).content})
    else:
        url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": text})
