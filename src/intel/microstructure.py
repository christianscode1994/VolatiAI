import json
from pathlib import Path

WHALE_THRESHOLD = 50
MAX_WHALE_ORDERS = 100
BOOK_DEPTH = 20


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def run():
    market = load_json("private/pro_market.json")

    kraken = market.get("btc", {}).get("kraken", {})

    bids = kraken.get("bids", [])
    asks = kraken.get("asks", [])

    if not isinstance(bids, list):
        bids = []

    if not isinstance(asks, list):
        asks = []

    # Keep only large orders
    whales = [
        level
        for level in (bids + asks)
        if isinstance(level, list)
        and len(level) >= 2
        and isinstance(level[1], (int, float))
        and level[1] >= WHALE_THRESHOLD
    ]

    # Prevent file bloat
    whales = whales[:MAX_WHALE_ORDERS]

    # Analyze only top levels
    top_bids = bids[:BOOK_DEPTH]

    spoofing_levels = [
        level
        for level in top_bids
        if isinstance(level, list)
        and len(level) >= 2
        and isinstance(level[1], (int, float))
        and level[1] < 0.5
    ]

    spoofing_score = min(
        (len(spoofing_levels) / BOOK_DEPTH) * 100,
        100
    )

    out = {
        "summary": {
            "whale_order_count": len(whales),
            "spoofing_score": round(spoofing_score, 2)
        },
        "whale_orders": whales
    }

    Path("private/microstructure.json").write_text(
        json.dumps(out, indent=2),
        encoding="utf-8"
    )

    return out


if __name__ == "__main__":
    run()
