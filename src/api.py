from fastapi import FastAPI, HTTPException
from history import read_latest_snapshot, read_snapshots
from metrics import (
    METRICS,
    aggregate_metric,
    aggregate_all_metrics,
    volatai_score,
    detect_alerts,
)
from dashboard import build_dashboard
from defi_scoring import score_defi
from compute_defi_alerts import compute_defi_alerts

app = FastAPI(
    title="VolatiAI API",
    description="Unified analytics API for whales, spoofing, liquidity, sentiment, volatility, and DeFi health.",
    version="1.0.0",
)


# --- ROOT ---

@app.get("/")
def root():
    return {
        "service": "VolatiAI API",
        "version": "1.0.0",
        "endpoints": [
            "/dashboard",
            "/score",
            "/alerts",
            "/metric/{name}",
            "/latest/{name}",
            "/snapshots/{name}/{days}",
            "/defi",
            "/defi/score",
            "/defi/alerts",
            "/defi/history",
            "/defi/trends",
            "/defi/liquidity",
            "/defi/peg",
            "/defi/utilization",
            "/defi/curve",
            "/defi/volatility",
        ],
    }


# --- DASHBOARD ---

@app.get("/dashboard")
def api_dashboard(days: int = 7):
    return build_dashboard(days)


# --- COMPOSITE SCORE ---

@app.get("/score")
def api_score(days: int = 7):
    agg = aggregate_all_metrics(__import__("history"), days)
    score = volatai_score(agg)
    return {"days": days, "score": score}


# --- ALERTS ---

@app.get("/alerts")
def api_alerts(days: int = 7):
    agg = aggregate_all_metrics(__import__("history"), days)
    alerts = detect_alerts(agg)
    return {"days": days, "alerts": alerts}


# --- METRIC AGGREGATION ---

@app.get("/metric/{name}")
def api_metric(name: str, days: int = 7):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snaps = read_snapshots(name, days)
    agg = aggregate_metric(name, snaps)
    return {"metric": name, "days": days, "aggregated": agg}


# --- LATEST SNAPSHOT ---

@app.get("/latest/{name}")
def api_latest(name: str):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snap = read_latest_snapshot(name)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshots found")

    return {"metric": name, "latest": snap}


# --- RAW SNAPSHOTS WINDOW ---

@app.get("/snapshots/{name}/{days}")
def api_snapshots(name: str, days: int):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snaps = read_snapshots(name, days)
    return {"metric": name, "days": days, "snapshots": snaps}


# ============================================================
# =======================  DEFI API  =========================
# ============================================================

def _latest_defi(days: int):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")
    return snaps[-1]


# --- DEFI ROOT ---

@app.get("/defi")
def api_defi(days: int = 7):
    d = build_dashboard(days)
    if not d["defi"]:
        raise HTTPException(status_code=404, detail="No DeFi data available")
    return d["defi"]


# --- DEFI SCORE ---

@app.get("/defi/score")
def api_defi_score(days: int = 7):
    latest = _latest_defi(days)
    score = score_defi(
        latest.get("uniswap_liquidity", 0),
        latest.get("sushiswap_liquidity", 0),
        latest.get("curve_stability", 0),
        latest.get("aave_utilization", 0),
        latest.get("dai_peg_deviation", 0),
    )
    return {"days": days, "score": score}


# --- DEFI ALERTS ---

@app.get("/defi/alerts")
def api_defi_alerts(days: int = 7):
    latest = _latest_defi(days)
    alerts = compute_defi_alerts(latest)
    return {"days": days, "alerts": alerts}


# --- DEFI HISTORY ---

@app.get("/defi/history")
def api_defi_history(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")
    return {"days": days, "snapshots": snaps}


# --- DEFI TRENDS ---

@app.get("/defi/trends")
def api_defi_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    scores = [
        score_defi(
            s.get("uniswap_liquidity", 0),
            s.get("sushiswap_liquidity", 0),
            s.get("curve_stability", 0),
            s.get("aave_utilization", 0),
            s.get("dai_peg_deviation", 0),
        )
        for s in snaps
    ]

    return {
        "days": days,
        "points": len(scores),
        "scores": scores,
    }


# ============================================================
# ===================  EXTRA DEFI METRICS  ===================
# ============================================================

@app.get("/defi/liquidity")
def api_defi_liquidity(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "uniswap_liquidity": latest.get("uniswap_liquidity", 0),
        "sushiswap_liquidity": latest.get("sushiswap_liquidity", 0),
    }


@app.get("/defi/peg")
def api_defi_peg(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "dai_peg_deviation": latest.get("dai_peg_deviation", 0),
    }


@app.get("/defi/utilization")
def api_defi_utilization(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "aave_utilization": latest.get("aave_utilization", 0),
    }


@app.get("/defi/curve")
def api_defi_curve(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "curve_stability": latest.get("curve_stability", 0),
    }


@app.get("/defi/volatility")
def api_defi_volatility(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    scores = [
        score_defi(
            s.get("uniswap_liquidity", 0),
            s.get("sushiswap_liquidity", 0),
            s.get("curve_stability", 0),
            s.get("aave_utilization", 0),
            s.get("dai_peg_deviation", 0),
        )
        for s in snaps
    ]

    if len(scores) < 2:
        return {"days": days, "volatility": 0.0}

    mean = sum(scores) / len(scores)
    variance = sum((x - mean) ** 2 for x in scores) / len(scores)
    volatility = variance ** 0.5

    return {"days": days, "volatility": volatility}
