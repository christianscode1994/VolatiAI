#!/usr/bin/env python3
"""Send /sentiment to Telegram. Called from scheduled workflow after pipeline."""
import os
import sys
import json
import requests


def main() -> int:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
        return 1

    try:
        with open("private/narrative_latest.json") as f:
            snap = json.load(f)
    except FileNotFoundError:
        print("ERROR: private/narrative_latest.json missing — run pipeline first")
        return 1

    top = snap["defi_top"][0] if snap.get("defi_top") else {"name": "—", "tvl_b": 0}
    msg = (
        "\U0001FA99 <b>Crypto Sentiment</b>\n"
        f"FGI: {snap['fgi_value']}/100 ({snap['fgi_class']}, trend {snap['fgi_trend']})\n"
        f"News: {snap['rss_label']} ({snap['rss_score']:+.3f}, {snap['rss_count']} headlines)\n"
        f"Top DeFi TVL: {top['name']} (${top['tvl_b']}B)"
    )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    r = requests.post(url, json={
        "chat_id": chat_id,
        "text": msg,
        "parse_mode": "HTML",
    }, timeout=15)

    print(f"Telegram: {r.status_code} {r.text}")
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main())
