import json
from pathlib import Path

def run():
    market = json.load(open("private/pro_market.json"))
    kr = market.get("btc", {}).get("kraken", {})
    bids = kr.get("bids", [])
    asks = kr.get("asks", [])

    whale_threshold = 50  # BTC
    whales = [b for b in bids + asks if b[1] >= whale_threshold]

    spoofing_levels = [b for b in bids[:20] if b[1] < 0.5]  # tiny size, many levels
    spoofing_score = min(len(spoofing_levels) / 10 * 100, 100)

    out = {
        "whale_orders": whales,
        "spoofing_score": spoofing_score
    }
    Path("private/microstructure.json").write_text(json.dumps(out, indent=2))

if __name__ == "__main__":
    run()
