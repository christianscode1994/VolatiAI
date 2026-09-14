from fastapi import FastAPI, HTTPException
from .history import read_latest_snapshot, read_snapshots
from .metrics import (
    METRICS,
    aggregate_metric,
    aggregate_all_metrics,
    volatai_score,
    detect_alerts,
)
from .dashboard import build_dashboard
from .defi_scoring import score_defi
from .compute_defi_alerts import compute_defi_alerts

app = FastAPI(
    title="VolatiAI API",
    description="Unified analytics API for whales, spoofing, liquidity, sentiment, volatility, and DeFi health.",
    version="1.0.0",
)

# ============================================================
# =========================== ROOT ============================
# ============================================================

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
            "/sentiment/metrics",
            "/sentiment/volatility",
            "/sentiment/regime",
            "/sentiment/early-warning",
            "/macro/metrics",
            "/macro/stress-test",
            "/macro/regime",
            "/macro/early-warning",
            "/macro/intel-report",
            "/fusion/score",
            "/fusion/regime",
            "/fusion/early-warning",
            "/fusion/index",
            "/fusion/intel-report",
            "/narrative/metrics",
            "/narrative/volatility",
            "/narrative/regime",
            "/narrative/early-warning",
            "/narrative/intel-report",
            "/risk/metrics",
            "/risk/score",
            "/risk/regime",
            "/risk/early-warning",
            "/risk/intel-report",
        ],
    }

# ============================================================
# ======================== DASHBOARD ==========================
# ============================================================

@app.get("/dashboard")
def api_dashboard(days: int = 7):
    return build_dashboard(days)

# ============================================================
# ===================== COMPOSITE SCORE =======================
# ============================================================

@app.get("/score")
def api_score(days: int = 7):
    agg = aggregate_all_metrics(read_snapshots, days)
    score = volatai_score(agg)
    return {"days": days, "score": score}

# ============================================================
# ========================= ALERTS ============================
# ============================================================

@app.get("/alerts")
def api_alerts(days: int = 7):
    agg = aggregate_all_metrics(read_snapshots, days)
    alerts = detect_alerts(agg)
    return {"days": days, "alerts": alerts}

# ============================================================
# ===================== METRIC AGGREGATION ====================
# ============================================================

@app.get("/metric/{name}")
def api_metric(name: str, days: int = 7):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snaps = read_snapshots(name, days)
    agg = aggregate_metric(name, snaps)
    return {"metric": name, "days": days, "aggregated": agg}

# ============================================================
# ======================= LATEST SNAPSHOT =====================
# ============================================================

@app.get("/latest/{name}")
def api_latest(name: str):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snap = read_latest_snapshot(name)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshots found")

    return {"metric": name, "latest": snap}

# ============================================================
# ===================== RAW SNAPSHOTS WINDOW ==================
# ============================================================

@app.get("/snapshots/{name}/{days}")
def api_snapshots(name: str, days: int):
    if name not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    snaps = read_snapshots(name, days)
    return {"metric": name, "days": days, "snapshots": snaps}


# ============================================================
# ========================= DEFI ROOT =========================
# ============================================================

def _latest_defi(days: int):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")
    return snaps[-1]


@app.get("/defi")
def api_defi(days: int = 7):
    d = build_dashboard(days)
    if not d["defi"]:
        raise HTTPException(status_code=404, detail="No DeFi data available")
    return d["defi"]


# ============================================================
# ========================= DEFI SCORE ========================
# ============================================================

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


# ============================================================
# ========================= DEFI ALERTS =======================
# ============================================================

@app.get("/defi/alerts")
def api_defi_alerts(days: int = 7):
    latest = _latest_defi(days)
    alerts = compute_defi_alerts(latest)
    return {"days": days, "alerts": alerts}


# ============================================================
# ========================= DEFI HISTORY ======================
# ============================================================

@app.get("/defi/history")
def api_defi_history(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")
    return {"days": days, "snapshots": snaps}


# ============================================================
# ========================= DEFI TRENDS =======================
# ============================================================

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

    return {"days": days, "points": len(scores), "scores": scores}


# ============================================================
# ======================= EXTRA DEFI METRICS ==================
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

    return {
        "days": days,
        "uniswap_liquidity": [s.get("uniswap_liquidity", 0) for s in snaps],
        "sushiswap_liquidity": [s.get("sushiswap_liquidity", 0) for s in snaps],
    }


@app.get("/defi/peg")
def api_defi_peg(days: int = 7):
    latest = _latest_defi(days)
    return {"days": days, "dai_peg_deviation": latest.get("dai_peg_deviation", 0)}


@app.get("/defi/peg/trends")
def api_defi_peg_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    return {"days": days, "dai_peg_deviation": [s.get("dai_peg_deviation", 0) for s in snaps]}


@app.get("/defi/utilization")
def api_defi_utilization(days: int = 7):
    latest = _latest_defi(days)
    return {"days": days, "aave_utilization": latest.get("aave_utilization", 0)}


@app.get("/defi/utilization/trends")
def api_defi_utilization_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    return {"days": days, "aave_utilization": [s.get("aave_utilization", 0) for s in snaps]}


@app.get("/defi/curve")
def api_defi_curve(days: int = 7):
    latest = _latest_defi(days)
    return {"days": days, "curve_stability": latest.get("curve_stability", 0)}


@app.get("/defi/curve/trends")
def api_defi_curve_trends(days: int = 7):
    snaps = read_snapshots("defi_health", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No DeFi snapshots found")

    return {"days": days, "curve_stability": [s.get("curve_stability", 0) for s in snaps]}


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
    return {"days": days, "volatility": variance ** 0.5}


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

    return {"days": days, "volatility_trend": vol}


@app.get("/defi/risk")
def api_defi_risk(days: int = 7):
    latest = _latest_defi(days)
    peg = latest.get("dai_peg_deviation", 0)
    util = latest.get("aave_utilization", 0)
    curve = latest.get("curve_stability", 0)

    risk = abs(peg) * 2 + util * 1.5 + (1 - curve) * 1.2

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
        },
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

# ============================================================
# ======================= SENTIMENT ===========================
# ============================================================

@app.get("/sentiment/metrics")
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


@app.get("/sentiment/volatility")
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


@app.get("/sentiment/regime")
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


@app.get("/sentiment/early-warning")
def api_sentiment_early_warning(days: int = 7):
    snaps = read_snapshots("sentiment", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough sentiment snapshots")

    latest = snaps[-1]
    prev = snaps[-2]
    prev2 = snaps[-3]

    reddit_trend = latest.get("reddit", {}).get("score", 0) - prev.get("reddit", {}).get("score", 0)
    hn_trend = latest.get("hn", {}).get("score", 0) - prev.get("hn", {}).get("score", 0)

    warnings = []

    if latest.get("reddit", {}).get("score", 0) < -0.2 and reddit_trend < 0:
        warnings.append("Reddit sentiment is negative and worsening.")

    if latest.get("hn", {}).get("score", 0) < -0.2 and hn_trend < 0:
        warnings.append("Hacker News sentiment is negative and worsening.")

    regime_info = api_sentiment_regime(days)

    return {
        "days": days,
        "regime": regime_info["regime"],
        "warnings": warnings,
        "metrics": {
            "reddit_score": latest.get("reddit", {}).get("score", 0),
            "hn_score": latest.get("hn", {}).get("score", 0),
        },
    }


# ============================================================
# ======================== MACRO METRICS ======================
# ============================================================

@app.get("/macro/metrics")
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


@app.get("/macro/stress-test")
def api_macro_stress_test(days: int = 7):
    m = api_macro_metrics(days)
    stress_risk_off = m["risk_off"] + 0.3
    stress_liquidity = max(m["liquidity"] - 0.3, 0.0)
    stress_policy = m["policy_pressure"] + 0.2

    stress_score = (
        stress_risk_off * 0.6 +
        (1.0 - stress_liquidity) * 0.3 +
        stress_policy * 0.5
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


@app.get("/macro/regime")
def api_macro_regime(days: int = 7):
    m = api_macro_metrics(days)
    if m["risk_off"] > 0.6 and m["liquidity"] < 0.4:
        regime = "risk_off"
    elif m["liquidity"] > 0.6 and m["policy_pressure"] < 0.4:
        regime = "risk_on"
    else:
        regime = "mixed"

    return {"days": days, "regime": regime, "metrics": m}


@app.get("/macro/early-warning")
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

    return {"days": days, "warnings": warnings, "metrics": m1}


@app.get("/macro/intel-report")
def api_macro_intel_report(days: int = 7):
    m = api_macro_metrics(days)
    regime = api_macro_regime(days)
    ew = api_macro_early_warning(days)

    lines = [
        f"Macro regime: {regime['regime']}.",
        f"Risk‑off index: {round(m['risk_off'], 6)}.",
        f"Liquidity index: {round(m['liquidity'], 6)}.",
        f"Policy pressure: {round(m['policy_pressure'], 6)}.",
    ]

    if ew["warnings"]:
        lines.append("Early‑warning signals:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major macro early‑warning signals detected.")

    return {"days": days, "intel_report": " ".join(lines)}

# ============================================================
# ========================= FUSION ============================
# ============================================================

@app.get("/fusion/score")
def api_fusion_score(days: int = 7):
    market = api_metric("market", days)
    sentiment = api_sentiment_metrics(days)
    macro = api_macro_metrics(days)
    defi = api_defi_health(days)

    vol = market["aggregated"].get("volatility", 0.0)
    mr = market["aggregated"].get("mean", 0.0)
    sent = (sentiment["reddit_avg"] + sentiment["hn_avg"]) / 2.0
    risk_off = macro["risk_off"]
    liq = macro["liquidity"]
    defi_score = defi.get("health_score", 0.5)

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


@app.get("/fusion/regime")
def api_fusion_regime(days: int = 7):
    f = api_fusion_score(days)
    score = f["fusion_score"]
    if score > 0.7:
        regime = "constructive"
    elif score < 0.3:
        regime = "fragile"
    else:
        regime = "balanced"
    return {"days": days, "regime": regime, "fusion_score": score}


@app.get("/fusion/early-warning")
def api_fusion_early_warning(days: int = 7):
    market = api_metric("market", days)
    sentiment = api_sentiment_metrics(days)
    macro = api_macro_metrics(days)
    defi = api_defi_health(days)

    warnings = []
    if market["aggregated"].get("volatility", 0.0) > 0.05:
        warnings.append("High market volatility.")
    if sentiment["reddit_avg"] < -0.2 and sentiment["hn_avg"] < -0.2:
        warnings.append("Broadly negative sentiment.")
    if macro["risk_off"] > 0.6:
        warnings.append("Macro risk‑off regime.")
    if defi.get("health_score", 0.0) < 0.4:
        warnings.append("DeFi systemic stress elevated.")

    return {"days": days, "warnings": warnings}


@app.get("/fusion/index")
def api_fusion_index(days: int = 7):
    f = api_fusion_score(days)
    index = max(0.0, min(100.0, f["fusion_score"] * 100.0))
    return {"days": days, "volatai_index": round(index, 2), "fusion_score": f["fusion_score"]}


@app.get("/fusion/intel-report")
def api_fusion_intel_report(days: int = 7):
    fscore = api_fusion_score(days)
    fregime = api_fusion_regime(days)
    macro_reg = api_macro_regime(days)
    sent_reg = api_sentiment_regime(days)

    lines = [
        f"Fusion regime: {fregime['regime']} (score {round(fscore['fusion_score'], 6)}).",
        f"Sentiment regime: {sent_reg['regime']}.",
        f"Macro regime: {macro_reg['regime']}.",
    ]

    return {"days": days, "intel_report": " ".join(lines)}

# ============================================================
# ===================== NARRATIVE (N1–N5) =====================
# ============================================================

@app.get("/narrative/metrics")
def api_narrative_metrics(days: int = 7):
    snaps = read_snapshots("narrative", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No narrative snapshots")

    scores = [s.get("score", 0.0) for s in snaps]

    return {
        "days": days,
        "avg_narrative_score": round(sum(scores) / len(scores), 6),
    }


@app.get("/narrative/volatility")
def api_narrative_volatility(days: int = 7):
    snaps = read_snapshots("narrative", days)
    if not snaps or len(snaps) < 2:
        raise HTTPException(status_code=404, detail="Not enough narrative snapshots")

    scores = [s.get("score", 0.0) for s in snaps]
    mean = sum(scores) / len(scores)
    vol = (sum((x - mean) ** 2 for x in scores) / len(scores)) ** 0.5

    return {"days": days, "narrative_volatility": round(vol, 6)}


@app.get("/narrative/regime")
def api_narrative_regime(days: int = 7):
    m = api_narrative_metrics(days)
    score = m["avg_narrative_score"]

    if score > 0.2:
        regime = "hype"
    elif score < -0.2:
        regime = "fear"
    else:
        regime = "mixed"

    return {"days": days, "regime": regime, "avg_narrative_score": score}


@app.get("/narrative/early-warning")
def api_narrative_early_warning(days: int = 7):
    snaps = read_snapshots("narrative", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough narrative snapshots")

    m1 = api_narrative_metrics(days)
    m2 = api_narrative_metrics(days - 1)
    m3 = api_narrative_metrics(days - 2)

    warnings = []
    if m1["avg_narrative_score"] > m2["avg_narrative_score"] > m3["avg_narrative_score"]:
        warnings.append("Narrative hype building.")
    if m1["avg_narrative_score"] < m2["avg_narrative_score"] < m3["avg_narrative_score"]:
        warnings.append("Narrative fear building.")

    return {"days": days, "warnings": warnings, "metrics": m1}


@app.get("/narrative/intel-report")
def api_narrative_intel_report(days: int = 7):
    m = api_narrative_metrics(days)
    regime = api_narrative_regime(days)
    ew = api_narrative_early_warning(days)

    lines = [
        f"Narrative regime: {regime['regime']}.",
        f"Average narrative score: {round(m['avg_narrative_score'], 6)}.",
    ]

    if ew["warnings"]:
        lines.append("Early‑warning signals:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major narrative early‑warning signals detected.")

    return {"days": days, "intel_report": " ".join(lines)}

# ============================================================
# ======================== RISK (R1–R5) =======================
# ============================================================

@app.get("/risk/metrics")
def api_risk_metrics(days: int = 7):
    snaps = read_snapshots("risk", days)
    if not snaps:
        raise HTTPException(status_code=404, detail="No risk snapshots")

    def avg(key):
        vals = [s.get(key, 0.0) for s in snaps]
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "days": days,
        "market_risk": round(avg("market_risk"), 6),
        "defi_risk": round(avg("defi_risk"), 6),
        "liquidity_risk": round(avg("liquidity_risk"), 6),
        "sentiment_risk": round(avg("sentiment_risk"), 6),
    }


@app.get("/risk/score")
def api_risk_score(days: int = 7):
    m = api_risk_metrics(days)
    score = (
        m["market_risk"] * 0.3 +
        m["defi_risk"] * 0.3 +
        m["liquidity_risk"] * 0.2 +
        m["sentiment_risk"] * 0.2
    )
    return {"days": days, "risk_score": round(score, 6), "components": m}


@app.get("/risk/regime")
def api_risk_regime(days: int = 7):
    r = api_risk_score(days)
    s = r["risk_score"]

    if s > 0.7:
        regime = "high_risk"
    elif s < 0.3:
        regime = "low_risk"
    else:
        regime = "moderate_risk"

    return {"days": days, "regime": regime, "risk_score": s}


@app.get("/risk/early-warning")
def api_risk_early_warning(days: int = 7):
    snaps = read_snapshots("risk", days)
    if not snaps or len(snaps) < 3:
        raise HTTPException(status_code=404, detail="Not enough risk snapshots")

    m1 = api_risk_metrics(days)
    m2 = api_risk_metrics(days - 1)
    m3 = api_risk_metrics(days - 2)

    warnings = []
    if m1["defi_risk"] > m2["defi_risk"] > m3["defi_risk"]:
        warnings.append("DeFi risk rising.")
    if m1["liquidity_risk"] > 0.6:
        warnings.append("Liquidity risk elevated.")
    if m1["market_risk"] > 0.6:
        warnings.append("Market risk elevated.")

    return {"days": days, "warnings": warnings, "metrics": m1}


@app.get("/risk/intel-report")
def api_risk_intel_report(days: int = 7):
    r = api_risk_score(days)
    reg = api_risk_regime(days)
    ew = api_risk_early_warning(days)

    lines = [
        f"Risk regime: {reg['regime']} (score {round(r['risk_score'], 6)})."
    ]

    if ew["warnings"]:
        lines.append("Early‑warning signals:")
        for w in ew["warnings"]:
            lines.append(f"- {w}")
    else:
        lines.append("No major risk early‑warning signals detected.")

    return {"days": days, "intel_report": " ".join(lines)}


























