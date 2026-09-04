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
            "/defi/liquidity/trends",
            "/defi/peg",
            "/defi/peg/trends",
            "/defi/utilization",
            "/defi/utilization/trends",
            "/defi/curve",
            "/defi/curve/trends",
            "/defi/volatility",
            "/defi/volatility/trends",
            "/defi/risk",
            "/defi/summary",
            "/defi/health",
            "/defi/forecast",
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


@app.get("/defi/liquidity/trends")
def api_defi_liquidity_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    uniswap = [s.get("uniswap_liquidity", 0) for s in snaps]
    sushi = [s.get("sushiswap_liquidity", 0) for s in snaps]

    return {
        "days": days,
        "uniswap_liquidity": uniswap,
        "sushiswap_liquidity": sushi,
    }


@app.get("/defi/peg")
def api_defi_peg(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "dai_peg_deviation": latest.get("dai_peg_deviation", 0),
    }


@app.get("/defi/peg/trends")
def api_defi_peg_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    peg = [s.get("dai_peg_deviation", 0) for s in snaps]

    return {
        "days": days,
        "dai_peg_deviation": peg,
    }


@app.get("/defi/utilization")
def api_defi_utilization(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "aave_utilization": latest.get("aave_utilization", 0),
    }


@app.get("/defi/utilization/trends")
def api_defi_utilization_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    utilization = [s.get("aave_utilization", 0) for s in snaps]

    return {
        "days": days,
        "aave_utilization": utilization,
    }


@app.get("/defi/curve")
def api_defi_curve(days: int = 7):
    latest = _latest_defi(days)
    return {
        "days": days,
        "curve_stability": latest.get("curve_stability", 0),
    }


@app.get("/defi/curve/trends")
def api_defi_curve_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    curve = [s.get("curve_stability", 0) for s in snaps]

    return {
        "days": days,
        "curve_stability": curve,
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


@app.get("/defi/volatility/trends")
def api_defi_volatility_trends(days: int = 7):
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

    vol = []
    for i in range(len(scores)):
        window = scores[max(0, i - 2): i + 1]
        if len(window) < 2:
            vol.append(0.0)
        else:
            mean = sum(window) / len(window)
            variance = sum((x - mean) ** 2 for x in window) / len(window)
            vol.append(variance ** 0.5)

    return {
        "days": days,
        "volatility_trend": vol,
    }


# ============================================================
# ===================  ADVANCED DEFI METRICS  =================
# ============================================================

@app.get("/defi/risk")
def api_defi_risk(days: int = 7):
    latest = _latest_defi(days)

    peg = latest.get("dai_peg_deviation", 0)
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    risk = (
        abs(peg) * 2 +
        util * 1.5 +
        (1 - curve) * 1.2
    )

    return {
        "days": days,
        "risk_score": round(risk, 4),
        "components": {
            "peg_risk": abs(peg),
            "utilization_risk": util,
            "curve_risk": (1 - curve),
        },
    }


@app.get("/defi/summary")
def api_defi_summary(days: int = 7):
    latest = _latest_defi(days)

    return {
        "days": days,
        "summary": {
            "uniswap_liquidity": latest.get("uniswap_liquidity", 0),
            "sushiswap_liquidity": latest.get("sushiswap_liquidity", 0),
            "curve_stability": latest.get("curve_stability", 0),
            "aave_utilization": latest.get("aave_utilization", 0),
            "dai_peg_deviation": latest.get("dai_peg_deviation", 0),
            "defi_score": score_defi(
                latest.get("uniswap_liquidity", 0),
                latest.get("sushiswap_liquidity", 0),
                latest.get("curve_stability", 0),
                latest.get("aave_utilization", 0),
                latest.get("dai_peg_deviation", 0),
            ),
            "alerts": compute_defi_alerts(latest),
        }
    }


@app.get("/defi/health")
def api_defi_health(days: int = 7):
    latest = _latest_defi(days)

    score = score_defi(
        latest.get("uniswap_liquidity", 0),
        latest.get("sushiswap_liquidity", 0),
        latest.get("curve_stability", 0),
        latest.get("aave_utilization", 0),
        latest.get("dai_peg_deviation", 0),
    )

    health = max(0.0, min(1.0, score))

    return {
        "days": days,
        "health_score": round(health, 4),
        "status": (
            "excellent" if health >= 0.8 else
            "good" if health >= 0.6 else
            "fair" if health >= 0.4 else
            "poor"
        ),
    }


@app.get("/defi/forecast")
def api_defi_forecast(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")


@app.get("/defi/anomalies")
def api_defi_anomalies(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    anomalies = []
    for s in snaps:
        if abs(s.get("dai_peg_deviation", 0)) > 0.02:
            anomalies.append({"type": "peg_break", "snapshot": s})
        if s.get("uniswap_liquidity", 0) < 0.5 * snaps[-1].get("uniswap_liquidity", 1):
            anomalies.append({"type": "liquidity_drop", "snapshot": s})
        if s.get("aave_utilization", 0) > 0.9:
            anomalies.append({"type": "utilization_spike", "snapshot": s})
        if s.get("curve_stability", 0) < 0.8:
            anomalies.append({"type": "curve_imbalance", "snapshot": s})

    return {"days": days, "anomalies": anomalies}


@app.get("/defi/stability")
def api_defi_stability(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    peg_var = sum(abs(s.get("dai_peg_deviation", 0)) for s in snaps) / len(snaps)
    util_var = sum(s.get("aave_utilization", 0) for s in snaps) / len(snaps)
    curve_var = sum(s.get("curve_stability", 0) for s in snaps) / len(snaps)

    stability = max(0.0, min(1.0, (curve_var * 0.5 + (1 - peg_var) * 0.3 + (1 - util_var) * 0.2)))

@app.get("/defi/liquidity/forecast")
def api_defi_liquidity_forecast(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    uni = [s.get("uniswap_liquidity", 0) for s in snaps]
    sushi = [s.get("sushiswap_liquidity", 0) for s in snaps]

    def forecast(series):
        if len(series) < 3:
            return series[-1]
        return sum(series[-3:]) / 3

    return {
        "days": days,
        "uniswap_liquidity_forecast": round(forecast(uni), 4),
        "sushiswap_liquidity_forecast": round(forecast(sushi), 4),
        "method": "3-point moving average",
    }

@app.get("/defi/peg/forecast")
def api_defi_peg_forecast(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    peg = [s.get("dai_peg_deviation", 0) for s in snaps]

    if len(peg) < 3:
        forecast = peg[-1]
    else:
        forecast = sum(peg[-3:]) / 3

    return {
        "days": days,
        "peg_forecast": round(forecast, 6),
        "method": "3-point moving average",
    }

    

    
    return {
        "days": days,
        "stability_score": round(stability, 4),
        "components": {
            "peg_stability": round(1 - peg_var, 4),
            "utilization_stability": round(1 - util_var, 4),
            "curve_stability": round(curve_var, 4),
        },
    }

    # ============================================================
# =======================  TIER 4 ANALYTICS  ==================
# ============================================================

@app.get("/defi/systemic-risk")
def api_defi_systemic_risk(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    # Compute volatility of the DeFi score
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
        vol = 0.0
    else:
        mean = sum(scores) / len(scores)
        var = sum((x - mean) ** 2 for x in scores) / len(scores)
        vol = var ** 0.5

    latest = snaps[-1]
    peg = abs(latest.get("dai_peg_deviation", 0))
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    systemic_risk = (
        peg * 2.0 +
        util * 1.5 +
        (1 - curve) * 1.2 +
        vol * 1.0
    )

    return {
        "days": days,
        "systemic_risk_score": round(systemic_risk, 4),
        "components": {
            "peg_stress": peg,
            "utilization_stress": util,
            "curve_stress": (1 - curve),
            "volatility_stress": vol,
        },
    }


@app.get("/defi/correlation")
def api_defi_correlation(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    series = {
        "uniswap_liquidity": [s.get("uniswap_liquidity", 0) for s in snaps],
        "sushiswap_liquidity": [s.get("sushiswap_liquidity", 0) for s in snaps],
        "curve_stability": [s.get("curve_stability", 0) for s in snaps],
        "aave_utilization": [s.get("aave_utilization", 0) for s in snaps],
        "dai_peg_deviation": [s.get("dai_peg_deviation", 0) for s in snaps],
    }

    def corr(x, y):
        n = len(x)
        if n < 2:
            return 0.0
        mx = sum(x) / n
        my = sum(y) / n
        num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
        denx = sum((xi - mx) ** 2 for xi in x)
        deny = sum((yi - my) ** 2 for yi in y)
        if denx == 0 or deny == 0:
            return 0.0
        return num / ((denx ** 0.5) * (deny ** 0.5))

    keys = list(series.keys())
    matrix = {}
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            k1, k2 = keys[i], keys[j]
            matrix[f"{k1}__{k2}"] = corr(series[k1], series[k2])

    return {
        "days": days,
        "correlation_pairs": matrix,
    }


@app.get("/defi/liquidations")
def api_defi_liquidations(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    events = []
    for s in snaps:
        score = score_defi(
            s.get("uniswap_liquidity", 0),
            s.get("sushiswap_liquidity", 0),
            s.get("curve_stability", 0),
            s.get("aave_utilization", 0),
            s.get("dai_peg_deviation", 0),
        )
        util = s.get("aave_utilization", 0)
        peg = abs(s.get("dai_peg_deviation", 0))

        intensity = max(0.0, util * 0.5 + peg * 10 - score * 0.2)
        if intensity <= 0:
            continue

        events.append({
            "timestamp": s.get("timestamp", None),
            "simulated_liquidation_intensity": round(intensity, 4),
            "aave_utilization": util,
            "dai_peg_deviation": s.get("dai_peg_deviation", 0),
            "defi_score": score,
        })

    return {
        "days": days,
        "simulated_liquidations": events,
        "note": "Synthetic events derived from DeFi metrics; no real user or chain data.",
    }


@app.get("/defi/swaps")
def api_defi_swaps(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps or len(snaps) < 2:
        raise HTTPException(status_code=404, detail="Not enough DeFi snapshots")

    events = []
    for i in range(1, len(snaps)):
        prev = snaps[i - 1]
        curr = snaps[i]

        d_uni = curr.get("uniswap_liquidity", 0) - prev.get("uniswap_liquidity", 0)
        d_sushi = curr.get("sushiswap_liquidity", 0) - prev.get("sushiswap_liquidity", 0)
        curve = curr.get("curve_stability", 0)

        pressure = max(0.0, (abs(d_uni) + abs(d_sushi)) * (1 - curve))

        if pressure <= 0:
            continue

        events.append({
            "timestamp": curr.get("timestamp", None),
            "simulated_swap_pressure": round(pressure, 4),
            "delta_uniswap_liquidity": d_uni,
            "delta_sushiswap_liquidity": d_sushi,
            "curve_stability": curve,
        })

    return {
        "days": days,
        "simulated_swaps": events,
        "note": "Synthetic swap pressure derived from liquidity and curve metrics.",
    }


    
    
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

    if len(scores) < 3:
        forecast = scores[-1]
    else:
        forecast = sum(scores[-3:]) / 3

    return {
        "days": days,
        "forecast_score": round(forecast, 4),
        "method": "3-point moving average",
    }
