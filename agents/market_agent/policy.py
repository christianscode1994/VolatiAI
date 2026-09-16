import json
import time
from datetime import datetime

from src.tools_coingecko import CoinGecko
from src.tools_coinpaprika import CoinPaprika
from src.tools_kraken import Kraken
from src.tools_etherscan import Etherscan
from src.offline import snap, mode

cg = CoinGecko()
cp = CoinPaprika()
kr = Kraken()
es = Etherscan()


# -----------------------------
# Safe wrappers
# -----------------------------

def safe_call(fn, default=None, retries=3, delay=0.8):
    for _ in range(retries):
        try:
            out = fn()
            if out:
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

def score_global(g):
    if not g: return 0
    mcap = g.get("data", {}).get("total_market_cap", {}).get("usd", 0)
    vol = g.get("data", {}).get("total_volume", {}).get("usd", 0)
    return min(100, (mcap / 1e12) * 60 + (vol / 1e11) * 40)

def score_btc(b):
    if not b: return 0
    price = b.get("coingecko", {}).get("market_data", {}).get("current_price", {}).get("usd", 0)
    vol = b.get("coingecko", {}).get("market_data", {}).get("total_volume", {}).get("usd", 0)
    return min(100, (price / 100000) * 70 + (vol / 5e10) * 30)

def score_onchain(o):
    if not o: return 0
    txs = o.get("etherscan", {}).get("tx_count", 0)
    return min(100, (txs / 500000) * 100)

def composite_score(gs, bs, os):
    return round(gs * 0.4 + bs * 0.4 + os * 0.2, 2)


# -----------------------------
# Agent runtime
# -----------------------------

def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    # Global
    cg_global = safe_call(lambda: cg.global_market(), default={"error": "unavailable"})
    cp_global = safe_call(lambda: cp.global_market(), default={"error": "unavailable"})

    global_block = stamp(
        {
            "coingecko": cg_global,
            "coinpaprika": cp_global
        },
        {
            "coingecko": "ok" if cg_global else "fail",
            "coinpaprika": "ok" if cp_global else "fail"
        }
    )

    # BTC
    btc_block = {
        "coingecko": safe_call(lambda: cg.coin_info("bitcoin")),
        "coinpaprika": safe_call(lambda: cp.ticker("btc-bitcoin")),
        "kraken": safe_call(lambda: kr.ticker("XBT/USD"))
    }

    # On-chain
    onchain_block = {
        "etherscan": safe_call(lambda: es.tx_summary())
    }

    # Scores
    gs = score_global(global_block)
    bs = score_btc(btc_block)
    os = score_onchain(onchain_block)

    score_block = {
        "global_score": gs,
        "btc_score": bs,
        "onchain_score": os,
        "composite": composite_score(gs, bs, os)
    }

    return {
        "global": global_block,
        "btc": btc_block,
        "onchain": onchain_block,
        "score": score_block
    }


def run_offline():
    return snap.get("last", {
        "global": {},
        "btc": {},
        "onchain": {},
        "score": {}
    })


def write_outputs(data):
    import os
    os.makedirs("public", exist_ok=True)   # ← INSERTED HERE

    with open("public/latest.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
