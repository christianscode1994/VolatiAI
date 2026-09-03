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

app = FastAPI(
    title="VolatiAI API",
    description="Unified analytics API for whales, spoofing, liquidity, sentiment, volatility.",
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
