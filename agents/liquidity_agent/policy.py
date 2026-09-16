import json
import time
from datetime import datetime

from src.offline import snap, mode

from src.tools_kraken import Kraken
from src.tools_binance import Binance
from src.tools_coinbase import Coinbase

kr = Kraken()
bn = Binance()
cb = Coinbase()


# -----------------------------
# Anomaly detection helper
# -----------------------------
def detect_anomaly(current, previous, threshold=20):
    if previous is None:
        return False
    return abs(current - previous) >= threshold


# -----------------------------
# Safe wrappers
# -----------------------------
def safe_call(fn, default=None, retries=3, delay=0.8):
    for _ in range(retries):
        try:
            out = fn()
            if out is not None:
                return out
        except Exception:
            pass
        time.sleep(delay)
    return default


def stamp(data, status):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "data": data
    }


# -----------------------------
# Scoring model
# -----------------------------
def depth_score(depth_usd):
    if depth_usd is None:
        return 0
    return max(0, min(100, (depth_usd / 10_000_000) * 100))


def spread_score(spread_pct):
    if spread_pct is None:
        return 0
    return max(0, min(100, (1.0 - min(spread_pct, 5.0) / 5.0) * 100))


def slippage_score(slippage_pct):
    if slippage_pct is None:
        return 0
    return max(0, min(100, (1.0 - min(slippage_pct, 5.0) / 5.0) * 100))


def composite_liquidity(depth_s, spread_s, slip_s):
    return round(depth_s * 0.4 + spread_s * 0.3 + slip_s * 0.3, 2)


# -----------------------------
# Agent runtime
# -----------------------------
def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last_liquidity", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    # Fetch order books
    kr_book = safe_call(lambda: kr.order_book("XBT/USD"), default={})
    bn_book = safe_call(lambda: bn.order_book("BTCUSDT"), default={})
    cb_book = safe_call(lambda: cb.order_book("BTC-USD"), default={})

    status = {
        "kraken": "ok" if kr_book else "fail",
        "binance": "ok" if bn_book else "fail",
        "coinbase": "ok" if cb_book else "fail",
    }

    # Extract metrics
    metrics = {
        "kraken": {
            "depth_usd": kr_book.get("depth_usd"),
            "spread_pct": kr_book.get("spread_pct"),
            "slippage_pct": kr_book.get("slippage_pct_10k"),
        },
        "binance": {
            "depth_usd": bn_book.get("depth_usd"),
            "spread_pct": bn_book.get("spread_pct"),
            "slippage_pct": bn_book.get("slippage_pct_10k"),
        },
        "coinbase": {
            "depth_usd": cb_book.get("depth_usd"),
            "spread_pct": cb_book.get("spread_pct"),
            "slippage_pct": cb_book.get("slippage_pct_10k"),
        },
    }

    # Compute scores
    depth_scores = {ex: depth_score(m["depth_usd"]) for ex, m in metrics.items()}
    spread_scores = {ex: spread_score(m["spread_pct"]) for ex, m in metrics.items()}
    slippage_scores = {ex: slippage_score(m["slippage_pct"]) for ex, m in metrics.items()}

    avg_depth = sum(depth_scores.values()) / len(depth_scores) if depth_scores else 0
    avg_spread = sum(spread_scores.values()) / len(spread_scores) if spread_scores else 0
    avg_slip = sum(slippage_scores.values()) / len(slippage_scores) if slippage_scores else 0

    liq_score = composite_liquidity(avg_depth, avg_spread, avg_slip)

    score_block = {
        "per_exchange": {
            "depth": depth_scores,
            "spread": spread_scores,
            "slippage": slippage_scores,
        },
        "aggregate": {
            "depth": avg_depth,
            "spread": avg_spread,
            "slippage": avg_slip,
            "liquidity_score": liq_score,
        },
    }

    # -----------------------------
    # Anomaly detection + memory snapshots
    # -----------------------------
    prev_score = snap.get("last_liq_score", None)
    anomaly = detect_anomaly(liq_score, prev_score)

    snap.set("last_liq_score", liq_score)
    snap.set("last_liq_anomaly", anomaly)
    snap.set("last_liq_delta", liq_score - (prev_score or 0))
    snap.set("last_liq_timestamp", datetime.utcnow().isoformat())

    snap.set("last_liq_snapshot", {
        "timestamp": datetime.utcnow().isoformat(),
        "score": liq_score,
        "anomaly": anomaly,
        "raw": {
            "kraken": kr_book,
            "binance": bn_book,
            "coinbase": cb_book,
            "metrics": metrics,
        }
    })

    snap.persist()

    # -----------------------------
    # Final output
    # -----------------------------
    return {
        "snapshot": stamp(
            {
                "kraken": kr_book,
                "binance": bn_book,
                "coinbase": cb_book,
                "metrics": metrics,
            },
            status,
        ),
        "score": score_block,
    }


def run_offline():
    return snap.get("last_liquidity", {
        "snapshot": {},
        "score": {},
    })


def write_outputs(data):
    import os
    os.makedirs("public", exist_ok=True)

    with open("public/liquidity.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
