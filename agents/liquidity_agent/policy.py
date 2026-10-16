import json
import os
import time
from datetime import datetime

from src.offline import snap, mode

from src.tools_kraken import Kraken
from src.tools_binance import Binance
from src.tools_coinbase import Coinbase

kr = Kraken()
bn = Binance()
cb = Coinbase()


# --------------------------------------------------
# Anomaly Detection
# --------------------------------------------------

def detect_anomaly(current, previous, threshold=20):
    if previous is None:
        return False

    return abs(current - previous) >= threshold


# --------------------------------------------------
# Safe Wrapper
# --------------------------------------------------

def safe_call(fn, default=None, retries=3, delay=0.8):
    for _ in range(retries):
        try:
            result = fn()

            if result is not None:
                return result

        except Exception:
            pass

        time.sleep(delay)

    return default


# --------------------------------------------------
# Output Helper
# --------------------------------------------------

def stamp(data, status):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "data": data,
    }


# --------------------------------------------------
# Scoring Functions
# --------------------------------------------------

def depth_score(depth_usd):
    if depth_usd is None:
        return None

    return max(
        0,
        min(
            100,
            (depth_usd / 10_000_000) * 100
        ),
    )


def spread_score(spread_pct):
    if spread_pct is None:
        return None

    return max(
        0,
        min(
            100,
            (1.0 - min(spread_pct, 5.0) / 5.0) * 100
        ),
    )


def slippage_score(slippage_pct):
    if slippage_pct is None:
        return None

    return max(
        0,
        min(
            100,
            (1.0 - min(slippage_pct, 5.0) / 5.0) * 100
        ),
    )


def composite_liquidity(depth_s, spread_s, slip_s):
    return round(
        depth_s * 0.4 +
        spread_s * 0.3 +
        slip_s * 0.3,
        2,
    )


def average(values):
    valid = [
        float(v)
        for v in values
        if isinstance(v, (int, float))
    ]

    if not valid:
        return 0.0

    return sum(valid) / len(valid)


# --------------------------------------------------
# Runtime
# --------------------------------------------------

def run():

    current_mode = mode.detect()

    if current_mode == "online":

        data = run_online()

        snap.set("last_liquidity", data)

        snap.persist()

    else:

        data = run_offline()

    write_outputs(data)


# --------------------------------------------------
# Online Mode
# --------------------------------------------------

def run_online():

    kr_book = safe_call(
        lambda: kr.order_book("XBT/USD"),
        default={}
    )

    bn_book = safe_call(
        lambda: bn.order_book("BTCUSDT"),
        default={}
    )

    cb_book = safe_call(
        lambda: cb.order_book("BTC-USD"),
        default={}
    )

    status = {
        "kraken": "ok" if kr_book else "fail",
        "binance": "ok" if bn_book else "fail",
        "coinbase": "ok" if cb_book else "fail",
    }

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

    depth_scores = {}
    spread_scores = {}
    slippage_scores = {}

    for exchange, values in metrics.items():

        depth_scores[exchange] = depth_score(
            values["depth_usd"]
        )

        spread_scores[exchange] = spread_score(
            values["spread_pct"]
        )

        slippage_scores[exchange] = slippage_score(
            values["slippage_pct"]
        )

    avg_depth = average(depth_scores.values())
    avg_spread = average(spread_scores.values())
    avg_slippage = average(slippage_scores.values())

    liquidity_score = composite_liquidity(
        avg_depth,
        avg_spread,
        avg_slippage,
    )

    details = {
        "per_exchange": {
            "depth": depth_scores,
            "spread": spread_scores,
            "slippage": slippage_scores,
        },
        "aggregate": {
            "depth": round(avg_depth, 2),
            "spread": round(avg_spread, 2),
            "slippage": round(avg_slippage, 2),
            "liquidity_score": liquidity_score,
        },
    }

    previous_score = snap.get(
        "last_liq_score",
        None,
    )

    anomaly = detect_anomaly(
        liquidity_score,
        previous_score,
    )

    delta = (
        liquidity_score - previous_score
        if previous_score is not None
        else 0
    )

    timestamp = datetime.utcnow().isoformat()

    snap.set(
        "last_liq_score",
        liquidity_score,
    )

    snap.set(
        "last_liq_anomaly",
        anomaly,
    )

    snap.set(
        "last_liq_delta",
        delta,
    )

    snap.set(
        "last_liq_timestamp",
        timestamp,
    )

    snap.set(
        "last_liq_snapshot",
        {
            "timestamp": timestamp,
            "score": liquidity_score,
            "anomaly": anomaly,
            "delta": delta,
            "raw": {
                "kraken": kr_book,
                "binance": bn_book,
                "coinbase": cb_book,
                "metrics": metrics,
            },
        },
    )

    snap.persist()

    return {
        "metric": "liquidity",
        "timestamp": timestamp,

        # IMPORTANT:
        # Numeric score for metrics.py compatibility
        "score": liquidity_score,

        # Detailed data
        "details": details,

        "status": status,

        "anomaly": anomaly,

        "snapshot": stamp(
            {
                "kraken": kr_book,
                "binance": bn_book,
                "coinbase": cb_book,
                "metrics": metrics,
            },
            status,
        ),
    }


# --------------------------------------------------
# Offline Mode
# --------------------------------------------------

def run_offline():

    return snap.get(
        "last_liquidity",
        {
            "metric": "liquidity",
            "score": 0,
            "details": {},
            "snapshot": {},
        },
    )


# --------------------------------------------------
# Output
# --------------------------------------------------

def write_outputs(data):

    os.makedirs(
        "public",
        exist_ok=True,
    )

    with open(
        "public/liquidity.json",
        "w",
    ) as f:

        json.dump(
            data,
            f,
            indent=2,
        )


if __name__ == "__main__":
    run()
