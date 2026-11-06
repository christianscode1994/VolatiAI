import json
import time
from datetime import datetime

from src.offline import snap, mode

from src.tools_npm import Npm
from src.tools_cargo import Cargo
from src.tools_solana_dev import SolanaDev
from src.tools_evm_dev import EvmDev
from src.tools_polkadot_dev import PolkadotDev

npm = Npm()
cargo = Cargo()
sol = SolanaDev()
evm = EvmDev()
dot = PolkadotDev()


# -----------------------------
# Anomaly detection helper
# -----------------------------
def detect_anomaly(current, previous, threshold=25):
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
def normalize_activity(value, scale):
    if value is None:
        return 0
    return max(0, min(100, (value / scale) * 100))


def composite_score(scores, weights):
    total = 0.0
    wsum = 0.0
    for k, s in scores.items():
        w = weights.get(k, 0.0)
        total += s * w
        wsum += w
    return round(total / wsum, 2) if wsum > 0 else 0.0


# -----------------------------
# Agent runtime
# -----------------------------
def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last_developer_activity", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    # Fetch developer activity
    npm_stats = safe_call(lambda: npm.activity(), default={})
    cargo_stats = safe_call(lambda: cargo.activity(), default={})
    sol_stats = safe_call(lambda: sol.activity(), default={})
    evm_stats = safe_call(lambda: evm.activity(), default={})
    dot_stats = safe_call(lambda: dot.activity(), default={})

    status = {
        "npm": "ok" if npm_stats else "fail",
        "cargo": "ok" if cargo_stats else "fail",
        "solana": "ok" if sol_stats else "fail",
        "evm": "ok" if evm_stats else "fail",
        "polkadot": "ok" if dot_stats else "fail",
    }

    # Normalize scores
    scores = {
        "npm": normalize_activity(npm_stats.get("recent_downloads", 0), 1_000_000),
        "cargo": normalize_activity(cargo_stats.get("recent_downloads", 0), 500_000),
        "solana": normalize_activity(sol_stats.get("active_devs", 0), 2_000),
        "evm": normalize_activity(evm_stats.get("active_devs", 0), 5_000),
        "polkadot": normalize_activity(dot_stats.get("active_devs", 0), 1_500),
    }

    weights = {
        "npm": 0.1,
        "cargo": 0.1,
        "solana": 0.25,
        "evm": 0.35,
        "polkadot": 0.2,
    }

    dev_score = composite_score(scores, weights)

    score_block = {
        "per_ecosystem": scores,
        "composite": dev_score,
    }

    # -----------------------------
    # Anomaly detection + memory snapshots
    # -----------------------------
    prev_score = snap.get("last_dev_score", None)
    curr_score = score_block["composite"]

    anomaly = detect_anomaly(curr_score, prev_score)
    score_block["anomaly"] = anomaly

    snap.set("last_dev_score", curr_score)
    snap.set("last_dev_anomaly", anomaly)
    snap.set("last_dev_delta", curr_score - (prev_score or 0))
    snap.set("last_dev_timestamp", datetime.utcnow().isoformat())

    snap.set("last_dev_snapshot", {
        "timestamp": datetime.utcnow().isoformat(),
        "score": curr_score,
        "anomaly": anomaly,
        "raw": {
            "npm": npm_stats,
            "cargo": cargo_stats,
            "solana": sol_stats,
            "evm": evm_stats,
            "polkadot": dot_stats,
        }
    })

    snap.persist()

    # -----------------------------
    # Return final output
    # -----------------------------
    return {
        "snapshot": stamp(
            {
                "npm": npm_stats,
                "cargo": cargo_stats,
                "solana": sol_stats,
                "evm": evm_stats,
                "polkadot": dot_stats,
            },
            status,
        ),
        "score": score_block,
    }


def run_offline():
    return snap.get("last_developer_activity", {
        "snapshot": {},
        "score": {},
    })


def write_outputs(data):
    import os
    os.makedirs("public", exist_ok=True)

    with open("public/developer_activity.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
