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
from compute_defi_alerts import compute_defi_Ealerts

from .compute_defi_health import compute_defi_health_from_snapshots
from .api import (
    api_market_metrics,
    api_market_regime,

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

@app.get("/defi/stress-test")
def api_defi_stress_test(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    latest = snaps[-1]

    peg = latest.get("dai_peg_deviation", 0)
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    stress_peg = peg * 3.0
    stress_util = util * 1.8
    stress_curve = max(0.0, curve - 0.25)

    stress_score = (
        abs(stress_peg) * 2.0 +
        stress_util * 1.5 +
        (1 - stress_curve) * 1.2
    )

    return {
        "days": days,
        "stress_score": round(stress_score, 4),
        "shock_scenario": {
            "peg_break": round(stress_peg, 4),
            "utilization_spike": round(stress_util, 4),
            "curve_imbalance": round(1 - stress_curve, 4),
        },
    }

@app.get("/defi/risk-zones")
def api_defi_risk_zones(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    latest = snaps[-1]

    peg = abs(latest.get("dai_peg_deviation", 0))
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    score = peg * 2 + util * 1.5 + (1 - curve)

    if score < 0.5:
        zone = "green"
    elif score < 1.5:
        zone = "yellow"
    elif score < 3.0:
        zone = "orange"
    else:
        zone = "red"

    return {
        "days": days,
        "risk_zone": zone,
        "risk_score": round(score, 4),
    }

@app.get("/defi/narrative")
def api_defi_narrative(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    latest = snaps[-1]

    peg = latest.get("dai_peg_deviation", 0)
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    narrative = []

    if abs(peg) < 0.005:
        narrative.append("DAI peg remains stable.")
    else:
        narrative.append("DAI peg shows mild deviation.")

    if util < 0.4:
        narrative.append("Aave utilization is healthy.")
    elif util < 0.7:
        narrative.append("Aave utilization is elevated.")
    else:
        narrative.append("Aave utilization is under stress.")

    if curve > 0.9:
        narrative.append("Curve pools are well‑balanced.")
    else:
        narrative.append("Curve pools show imbalance pressure.")

    return {
        "days": days,
        "narrative": " ".join(narrative),
    }
@app.get("/defi/fusion")
def api_defi_fusion(days: int = 7):
    sys = api_defi_systemic_risk(days)
    stress = api_defi_stress_test(days)
    zones = api_defi_risk_zones(days)

    fusion_score = (
        sys["systemic_risk_score"] * 0.5 +
        stress["stress_score"] * 0.3 +
        zones["risk_score"] * 0.2
    )

    return {
        "days": days,
        "fusion_score": round(fusion_score, 4),
        "components": {
            "systemic_risk": sys["systemic_risk_score"],
            "stress_test": stress["stress_score"],
            "risk_zone_score": zones["risk_score"],
        },
    }

@app.get("/defi/macro-sensitivity")
def api_defi_macro_sensitivity(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    latest = snaps[-1]

    peg = abs(latest.get("dai_peg_deviation", 0))
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    sensitivity = (
        peg * 1.5 +
        util * 1.2 +
        (1 - curve) * 1.3
    )

    return {
        "days": days,
        "macro_sensitivity": round(sensitivity, 4),
        "note": "Synthetic macro sensitivity derived from DeFi metrics only.",
    }

    
    
    


    
    return {
        "days": days,
        "simulated_swaps": events,
        "note": "Synthetic swap pressure derived from liquidity and curve metrics.",
    }

@app.get("/defi/regime")
def api_defi_regime(days: int = 7):
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
        return {
            "days": days,
            "regime": "unknown",
            "reason": "not enough data",
        }

    mean = sum(scores) / len(scores)
    var = sum((x - mean) ** 2 for x in scores) / len(scores)
    vol = var ** 0.5

    if vol < 0.05:
        regime = "stable"
    elif vol < 0.15:
        regime = "fragile"
    elif vol < 0.3:
        regime = "stressed"
    else:
        regime = "chaotic"

    return {
        "days": days,
        "regime": regime,
        "volatility": round(vol, 4),
        "average_score": round(mean, 4),
    }


@app.get("/defi/early-warning")
def api_defi_early_warning(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough DeFi snapshots")

    latest = snaps[-1]
    prev = snaps[-2]
    prev2 = snaps[-3]

    peg_trend = latest.get("dai_peg_deviation", 0) - prev.get("dai_peg_deviation", 0)
    util_trend = latest.get("aave_utilization", 0) - prev.get("aave_utilization", 0)
    curve_trend = latest.get("curve_stability", 0) - prev.get("curve_stability", 0)

    warnings = []

    if abs(latest.get("dai_peg_deviation", 0)) > 0.01 and peg_trend > 0:
        warnings.append("Peg deviation is rising and above threshold.")

    if latest.get("aave_utilization", 0) > 0.7 and util_trend > 0:
        warnings.append("Aave utilization is high and increasing.")

    if latest.get("curve_stability", 0) < 0.9 and curve_trend < 0:
        warnings.append("Curve stability is low and deteriorating.")

    regime_info = api_defi_regime(days)

    return {
        "days": days,
        "regime": regime_info["regime"],
        "warnings": warnings,
        "metrics": {
            "peg_deviation": latest.get("dai_peg_deviation", 0),
            "aave_utilization": latest.get("aave_utilization", 0),
            "curve_stability": latest.get("curve_stability", 0),
        },
    }

    @app.get("/defi/intel-report")
def api_defi_intel_report(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    latest = snaps[-1]

    regime_info = api_defi_regime(days)
    ew = api_defi_early_warning(days)
    sys = api_defi_systemic_risk(days)

    lines = []

    lines.append(f"Current DeFi regime is {regime_info['regime']}.")
    lines.append(f"Systemic risk score is {round(sys['systemic_risk_score'], 4)}.")

    if ew["warnings"]:
        lines.append("Early‑warning signals detected:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major early‑warning signals at this time.")

    peg = latest.get("dai_peg_deviation", 0)
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    if abs(peg) < 0.005:
        lines.append("DAI peg remains tightly anchored.")
    else:
        lines.append("DAI peg shows noticeable deviation from parity.")

    if util < 0.4:
        lines.append("Aave utilization indicates comfortable lending conditions.")
    elif util < 0.7:
        lines.append("Aave utilization suggests elevated demand for leverage.")
    else:
        lines.append("Aave utilization is under significant stress.")

    if curve > 0.9:
        lines.append("Curve pools appear well‑balanced across assets.")
    else:
        lines.append("Curve pools exhibit imbalance, increasing routing and slippage risk.")

    return {
        "days": days,
        "intel_report": " ".join(lines),
    }

# S1 — Sentiment metrics
@router.get("/sentiment/metrics")
def api_sentiment_metrics(days: int = 7):
    snaps = read_snapshots("sentiment", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No sentiment snapshots")

    reddit_scores = [s["reddit"]["score"] for s in snaps if "reddit" in s]
    hn_scores = [s["hn"]["score"] for s in snaps if "hn" in s]

    def _avg(xs):
        return sum(xs) / len(xs) if xs else 0.0

    return {
        "days": days,
        "reddit_avg": round(_avg(reddit_scores), 6),
        "hn_avg": round(_avg(hn_scores), 6),
    }


# S2 — Sentiment volatility
@router.get("/sentiment/volatility")
def api_sentiment_volatility(days: int = 7):
    snaps = read_snapshots("sentiment", days)
    if not snaps or len(snaps) < 2:
        raise HTTPException(status_code=404, detail="Not enough sentiment snapshots")

    reddit_scores = [s["reddit"]["score"] for s in snaps if "reddit" in s]
    hn_scores = [s["hn"]["score"] for s in snaps if "hn" in s]

    def _vol(xs):
        if len(xs) < 2:
            return 0.0
        mean = sum(xs) / len(xs)
        return (sum((x - mean) ** 2 for x in xs) / len(xs)) ** 0.5

    return {
        "days": days,
        "reddit_volatility": round(_vol(reddit_scores), 6),
        "hn_volatility": round(_vol(hn_scores), 6),
    }


# S3 — Sentiment regime
@router.get("/sentiment/regime")
def api_sentiment_regime(days: int = 7):
    metrics = api_sentiment_metrics(days)
    reddit = metrics["reddit_avg"]
    hn = metrics["hn_avg"]

    avg = (reddit + hn) / 2.0

    if avg > 0.2:
        regime = "bullish"
    elif avg < -0.2:
        regime = "bearish"
    else:
        regime = "neutral"

    return {
        "days": days,
        "regime": regime,
        "reddit_avg": reddit,
        "hn_avg": hn,
    }


# S4 — Sentiment early-warning
@router.get("/sentiment/early-warning")
def api_sentiment_early_warning(days: int = 7):
    snaps = read_snapshots("sentiment", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough sentiment snapshots")

    m1 = api_sentiment_metrics(days)
    m2 = api_sentiment_metrics(days - 1)
    m3 = api_sentiment_metrics(days - 2)

    warnings = []

    if m1["reddit_avg"] < m2["reddit_avg"] < m3["reddit_avg"]:
        warnings.append("Reddit sentiment weakening consistently.")
    if m1["hn_avg"] < m2["hn_avg"] < m3["hn_avg"]:
        warnings.append("HN sentiment weakening consistently.")

    return {
        "days": days,
        "warnings": warnings,
        "metrics": m1,
    }


# S5 — Sentiment intelligence report
@router.get("/sentiment/intel-report")
def api_sentiment_intel_report(days: int = 7):
    metrics = api_sentiment_metrics(days)
    regime = api_sentiment_regime(days)
    ew = api_sentiment_early_warning(days)

    lines = []
    lines.append(f"Sentiment regime: {regime['regime']}.")
    lines.append(f"Reddit avg sentiment: {round(metrics['reddit_avg'], 6)}.")
    lines.append(f"HN avg sentiment: {round(metrics['hn_avg'], 6)}.")

    if ew["warnings"]:
        lines.append("Early‑warning signals:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major sentiment early‑warning signals detected.")

    return {
        "days": days,
        "intel_report": " ".join(lines),
    }    


# X1 — Macro metrics
@router.get("/macro/metrics")
def api_macro_metrics(days: int = 7):
    snaps = read_snapshots("macro", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No macro snapshots")

    def _avg_key(key):
        vals = [s.get(key, 0.0) for s in snaps]
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "days": days,
        "risk_off": round(_avg_key("risk_off"), 6),
        "liquidity": round(_avg_key("liquidity"), 6),
        "policy_pressure": round(_avg_key("policy_pressure"), 6),
    }


# X2 — Macro stress test
@router.get("/macro/stress-test")
def api_macro_stress_test(days: int = 7):
    m = api_macro_metrics(days)

    stress_risk_off = m["risk_off"] + 0.3
    stress_liquidity = max(m["liquidity"] - 0.3, 0.0)
    stress_policy = m["policy_pressure"] + 0.2

    stress_score = (
        stress_risk_off * 0.6
        + (1.0 - stress_liquidity) * 0.3
        + stress_policy * 0.5
    )

    return {
        "days": days,
        "stress_score": round(stress_score, 6),
        "shock_scenario": {
            "risk_off": round(stress_risk_off, 6),
            "liquidity": round(stress_liquidity, 6),
            "policy_pressure": round(stress_policy, 6),
        },
    }


# X3 — Macro regime
@router.get("/macro/regime")
def api_macro_regime(days: int = 7):
    m = api_macro_metrics(days)

    if m["risk_off"] > 0.6 and m["liquidity"] < 0.4:
        regime = "risk_off"
    elif m["liquidity"] > 0.6 and m["policy_pressure"] < 0.4:
        regime = "risk_on"
    else:
        regime = "mixed"

    return {
        "days": days,
        "regime": regime,
        "metrics": m,
    }


# X4 — Macro early-warning
@router.get("/macro/early-warning")
def api_macro_early_warning(days: int = 7):
    snaps = read_snapshots("macro", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough macro snapshots")

    m1 = api_macro_metrics(days)
    m2 = api_macro_metrics(days - 1)
    m3 = api_macro_metrics(days - 2)

    warnings = []

    if m1["risk_off"] > m2["risk_off"] > m3["risk_off"]:
        warnings.append("Risk‑off pressure rising.")
    if m1["liquidity"] < m2["liquidity"] < m3["liquidity"]:
        warnings.append("Liquidity deteriorating.")
    if m1["policy_pressure"] > 0.7:
        warnings.append("High policy pressure detected.")

    return {
        "days": days,
        "warnings": warnings,
        "metrics": m1,
    }


# X5 — Macro intelligence report
@router.get("/macro/intel-report")
def api_macro_intel_report(days: int = 7):
    m = api_macro_metrics(days)
    regime = api_macro_regime(days)
    ew = api_macro_early_warning(days)

    lines = []
    lines.append(f"Macro regime: {regime['regime']}.")
    lines.append(f"Risk‑off index: {round(m['risk_off'], 6)}.")
    lines.append(f"Liquidity index: {round(m['liquidity'], 6)}.")
    lines.append(f"Policy pressure: {round(m['policy_pressure'], 6)}.")

    if ew["warnings"]:
        lines.append("Early‑warning signals:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major macro early‑warning signals detected.")

    return {
        "days": days,
        "intel_report": " ".join(lines),
    }



# F1 — Fusion score
@router.get("/fusion/score")
def api_fusion_score(days: int = 7):
    market = api_market_metrics(days)
    sentiment = api_sentiment_metrics(days)
    macro = api_macro_metrics(days)
    defi = compute_defi_health_from_snapshots()

    # Normalize some components
    vol = market["volatility"]
    mr = market["avg_return"]
    sent = (sentiment["reddit_avg"] + sentiment["hn_avg"]) / 2.0
    risk_off = macro["risk_off"]
    liq = macro["liquidity"]
    defi_score = defi.get("health_score", 0.5)  # assume 0–1

    fusion = (
        (1.0 - min(vol, 0.5)) * 0.2 +
        max(mr + 0.1, 0.0) * 0.2 +
        (sent + 0.5) * 0.2 +
        (1.0 - risk_off) * 0.2 +
        liq * 0.1 +
        defi_score * 0.1
    )

    return {
        "days": days,
        "fusion_score": round(fusion, 6),
        "components": {
            "volatility": vol,
            "avg_return": mr,
            "sentiment": sent,
            "risk_off": risk_off,
            "liquidity": liq,
            "defi_health": defi_score,
        },
    }


# F2 — Fusion regime
@router.get("/fusion/regime")
def api_fusion_regime(days: int = 7):
    f = api_fusion_score(days)
    score = f["fusion_score"]

    if score > 0.7:
        regime = "constructive"
    elif score < 0.3:
        regime = "fragile"
    else:
        regime = "balanced"

    return {
        "days": days,
        "regime": regime,
        "fusion_score": score,
    }


# F3 — Fusion early-warning
@router.get("/fusion/early-warning")
def api_fusion_early_warning(days: int = 7):
    snaps = read_snapshots("fusion", days)  # optional; or recompute
    # if you don't store fusion snapshots, we can just use components directly:
    market = api_market_metrics(days)
    sentiment = api_sentiment_metrics(days)
    macro = api_macro_metrics(days)
    defi = compute_defi_health_from_snapshots()

    warnings = []

    if market["volatility"] > 0.05:
        warnings.append("High market volatility.")
    if sentiment["reddit_avg"] < -0.2 and sentiment["hn_avg"] < -0.2:
        warnings.append("Broadly negative sentiment.")
    if macro["risk_off"] > 0.6:
        warnings.append("Macro risk‑off regime.")
    if defi.get("stress_level", 0.0) > 0.6:
        warnings.append("DeFi systemic stress elevated.")

    return {
        "days": days,
        "warnings": warnings,
    }


# F4 — VolatiAI Intelligence Index
@router.get("/fusion/index")
def api_fusion_index(days: int = 7):
    f = api_fusion_score(days)
    # Map 0–1 fusion score to 0–100 index
    index = max(0.0, min(100.0, f["fusion_score"] * 100.0))

    return {
        "days": days,
        "volatai_index": round(index, 2),
        "fusion_score": f["fusion_score"],
    }


# F5 — Full intelligence report
@router.get("/fusion/intel-report")
def api_fusion_intel_report(days: int = 7):
    fscore = api_fusion_score(days)
    fregime = api_fusion_regime(days)
    market_reg = api_market_regime(days)
    sent_reg = api_sentiment_regime(days)
    macro_reg = api_macro_regime(days)

    lines = []
    lines.append(f"Fusion regime: {fregime['regime']} (score {round(fscore['fusion_score'], 6)}).")
    lines.append(f"Market regime: {market_reg['regime']}.")
    lines.append(f"Sentiment regime: {sent_reg['regime']}.")
    lines.append(f"Macro regime: {macro_reg['regime']}.")

    return {
        "days": days,
        "intel_report": " ".join(lines),
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
