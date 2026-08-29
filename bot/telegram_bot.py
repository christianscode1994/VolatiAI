import json
from pathlib import Path
import os
import telebot  # pyTelegramBotAPI

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PRIVATE_DIR = BASE_DIR / "private"
KEYS_PATH = BASE_DIR / "keys" / "pro_keys.json"

# Prefer environment variable for security
BOT_TOKEN = os.getenv("BOT_TOKEN", "YOUR_TOKEN_HERE")

bot = telebot.TeleBot(BOT_TOKEN)

def load_pro_keys():
    if not KEYS_PATH.exists():
        return {}
    with open(KEYS_PATH, encoding="utf-8") as f:
        return json.load(f)

def is_pro(user_id):
    keys = load_pro_keys()
    return str(user_id) in keys

@bot.message_handler(commands=["start"])
def start(msg):
    bot.reply_to(msg,
        "VolatiAI\n"
        "/free – public data\n"
        "/pro – pro data (requires key)\n\n"
        "To upgrade to VolatiAI Pro, send payment to:\n"
        "PayPal: volatiaigithub@gmail.com\n"
        "After payment, send your Telegram user ID to receive your Pro key."
    )

@bot.message_handler(commands=["free"])
def free(msg):
    try:
        with open(PUBLIC_DIR / "free.json", encoding="utf-8") as f:
            data = json.load(f)
        bot.reply_to(msg, json.dumps(data, indent=2))
    except Exception as e:
        bot.reply_to(msg, f"Error reading free data: {e}")

@bot.message_handler(commands=["pro"])
def pro(msg):
    if not is_pro(msg.from_user.id):
        bot.reply_to(msg, "You need a Pro key to access /pro.\nContact: volatiaigithub@gmail.com")
        return
    try:
        with open(PRIVATE_DIR / "pro.json", encoding="utf-8") as f:
            data = json.load(f)
        bot.reply_to(msg, json.dumps(data, indent=2))
    except Exception as e:
        bot.reply_to(msg, f"Error reading pro data: {e}")

bot.polling()
