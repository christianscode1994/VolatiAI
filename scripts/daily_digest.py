#!/usr/bin/env python3
"""Daily digest from docs/latest.json + private/narrative_latest.json."""
import json
import os
import sys
import requests


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def build_digest():
    latest = load("docs/latest.json") or {}
    narrative = load("private/narrative_latest.json") or {}

    payload = latest.get("payload", {})
    volatility = payload.get("top_by_volatility", [])[:5]
    score = latest.get("score")
    metrics = latest.get("metrics")

    lines = ["\U0001F4CA <b>VolatiAI Daily Digest</b>", ""]

    if narrative:
        lines.append("\U0001F321 <b>Market Sentiment</b>")
        lines.append(
            f"FGI: {narrative.get('fgi_value')}/100 "
            f"({narrative.get('fgi_class')}, trend {narrative.get('fgi_trend')})"
        )
        lines.append(
            f"News: {narrative.get('rss_label')} "
            f"({narrative.get('rss_score', 0):+.3f}, "
            f"{narrative.get('rss_count', 0)} headlines)"
        )
        defi = narrative.get("defi_top", [])
        if defi:
            lines.append(f"Top DeFi: {defi[0]['name']} (${defi[0]['tvl_b']}B)")
        lines.append("")

    if volatility:
        lines.append("\U0001F4C8 <b>Top Volatility (24h)</b>")
        for coin in volatility:
            lines.append(
                f"\u2022 {coin['name']}: {coin['volatility']:.2f} "
                f"({coin['price_change_24h']:+.2f}%)"
            )
        lines.append("")

    if isinstance(score, dict) and score:
        lines.append("\U0001F3AF <b>Signals</b>")
        for key, val in score.items():
            label = key.replace("_", " ").title()
            lines.append(f"\u2022 {label}: {val}")
        lines.append("")
    elif isinstance(score, (int, float)):
        lines.append(f"\U0001F3AF <b>Overall Score:</b> {score}")
        lines.append("")

    if isinstance(metrics, dict) and metrics:
        interesting = {
            "trend_index", "liquidity_index",
            "narrative_index", "developer_sentiment_index",
        }
        matched = {k: v for k, v in metrics.items() if k in interesting}
        if matched:
            lines.append("\U0001F4CA <b>Metrics</b>")
            for key, val in matched.items():
                label = key.replace("_", " ").title()
                lines.append(f"\u2022 {label}: {val}")
            lines.append("")

    if narrative and narrative.get("nft_trending"):
        nfts = narrative["nft_trending"][:3]
        lines.append("\U0001F5BC <b>NFT Trending</b>")
        lines.append(" \u00b7 ".join(n["name"] for n in nfts))

    return "\n".join(lines)


def send(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    r = requests.post(
        url,
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=15,
    )
    print(f"Telegram: {r.status_code} {r.text[:200]}")
    return r.ok


def main():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing")
        return 1

    digest = build_digest()
    print("=== Digest ===")
    print(digest)
    print("=== Sending ===")
    return 0 if send(token, chat_id, digest) else 1


if __name__ == "__main__":
    sys.exit(main())
