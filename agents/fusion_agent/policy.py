import json
import os
from datetime import datetime

from src.offline import snap, mode


def load_json(path, default=None):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def stamp(data, status):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "data": data
    }


def clamp_score(x):
    return max(0, min(100, x if x is not None else 0))


def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last_fusion", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    market = load_json("public/latest.json", {})
    sentiment = load_json("public/sentiment.json", {})
    dev = load_json("public/developer_activity.json", {})
    liq = load_json("public/liquidity.json", {})

    status = {
        "market": "ok" if market else "fail",
        "sentiment": "ok" if sentiment else "fail",
        "developer_activity": "ok" if dev else "fail",
        "liquidity": "ok" if liq else "fail",
    }

    market_score = clamp_score(market.get("score", {}).get("composite"))
    sentiment_score = clamp_score(sentiment.get("score", {}).get("composite"))
    dev_score = clamp_score(dev.get("score", {}).get("composite"))
    liq_score = clamp_score(liq.get("score", {}).get("aggregate", {}).get("liquidity_score"))

    # F1–F4 as layers
    f1_raw = {
        "market": market,
        "sentiment": sentiment,
        "developer_activity": dev,
        "liquidity": liq,
    }

    f2_normalized = {
        "market_score": market_score,
        "sentiment_score": sentiment_score,
        "developer_activity_score": dev_score,
        "liquidity_score": liq_score,
    }

    # Thematic scores
    macro_score = round((market_score * 0.6 + liq_score * 0.4), 2)
    ecosystem_score = dev_score
    psychology_score = sentiment_score
    risk_score = round((100 - liq_score) * 0.7 + (100 - market_score) * 0.3, 2)

    f3_thematic = {
        "macro": macro_score,
        "ecosystem": ecosystem_score,
        "psychology": psychology_score,
        "risk": risk_score,
    }

    # Final VolatiAI composite
    composite = round(
        macro_score * 0.4 +
        ecosystem_score * 0.25 +
        psychology_score * 0.2 +
        (100 - risk_score) * 0.15,
        2,
    )

    f4_composite = {
        "volati_score": composite
    }

    fusion_block = {
        "F1_raw": f1_raw,
        "F2_normalized": f2_normalized,
        "F3_thematic": f3_thematic,
        "F4_composite": f4_composite,
    }

    return {
        "snapshot": stamp(fusion_block, status),
        "score": {
            "volati_score": composite,
            "layers": f3_thematic,
        },
    }


def run_offline():
    return snap.get("last_fusion", {
        "snapshot": {},
        "score": {},
    })


def write_outputs(data):
    os.makedirs("public", exist_ok=True)

    with open("public/fusion.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
