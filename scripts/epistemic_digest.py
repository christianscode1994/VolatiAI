#!/usr/bin/env python3
"""Epistemic digest: fetch envelopes, build graph, arbitrate, render."""

import concurrent.futures
import json
import os
import sys
import ssl
import urllib.request

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

DENSE_SECTORS = {"blockchain", "kryptovaluta", "finance", "currency-ex", "weather", "tracking", "shopping", "stocks", "energy", "crypto-defi", "metals"}
SPARSE_SECTORS = {"anime", "art-design", "biology", "books", "develop", "earthquakes", "education", "events", "food-drink", "health", "jobs", "music", "news", "open-source", "podcasts", "science", "science-math", "security", "space", "sports-fitness", "travel", "vehicles"}
SLOW_SECTORS = {"environment", "treasuries"}
WORKERS_BASE = "https://sector-{}.fourieranalys.workers.dev"


def load_active_sectors():
    with open("config/active_sectors.json") as f:
        return json.load(f)



# Metric aliases: same underlying data, different sector conventions
METRIC_ALIASES = {
    "treasury_10y": "us_10y_yield",
    "yield_10y": "us_10y_yield",
    "wti_crude": "wti",
}



# Expected relationships between metrics from different sectors.
# Based on historical norms that hold most of the time.
CORRELATION_RULES = [
    {
        "id": "sp500_vix",
        "sector_a": "stocks", "metric_a": "sp500",
        "sector_b": "tracking", "metric_b": "vix",
        "expected": "inverse",
        "min_move_pct": 1.0,
    },
    {
        "id": "gold_dxy",
        "sector_a": "metals", "metric_a": "gold",
        "sector_b": "finance", "metric_b": "dxy",
        "expected": "inverse",
        "min_move_pct": 0.5,
    },
    {
        "id": "gold_yield",
        "sector_a": "metals", "metric_a": "gold",
        "sector_b": "finance", "metric_b": "treasury_10y",
        "expected": "inverse",
        "min_move_pct": 0.3,
    },
    {
        "id": "wti_energy",
        "sector_a": "energy", "metric_a": "wti",
        "sector_b": "shopping", "metric_b": "wti",
        "expected": "correlated",
        "min_move_pct": 1.0,
    },
]


def find_correlation_anomalies(arbitrations, envelopes_by_sector):
    """Detect when two related metrics move against their historical norm."""
    anomalies = []

    # Build sector -> pct_change
    pct_by_sector = {}
    for a in arbitrations:
        env = envelopes_by_sector.get(a["sector"], {})
        delta = env.get("delta") or {}
        pct = delta.get("pct_change")
        current = delta.get("current")
        if pct is None or current is None:
            continue
        pct_by_sector[a["sector"]] = {
            "pct": pct,
            "current": current,
            "metric": delta.get("metric"),
        }

    for rule in CORRELATION_RULES:
        a = pct_by_sector.get(rule["sector_a"])
        b = pct_by_sector.get(rule["sector_b"])
        if not a or not b:
            continue

        # Verify each sector actually reports the metric the rule expects
        if a["metric"] != rule["metric_a"]:
            continue
        if b["metric"] != rule["metric_b"]:
            continue

        # Both must have moved at least min_move_pct
        if abs(a["pct"]) < rule["min_move_pct"] or abs(b["pct"]) < rule["min_move_pct"]:
            continue

        same_direction = (a["pct"] > 0) == (b["pct"] > 0)

        # Check if this violates expectation
        violated = False
        if rule["expected"] == "inverse" and same_direction:
            violated = True
        elif rule["expected"] == "correlated" and not same_direction:
            violated = True

        if violated:
            anomalies.append({
                "rule": rule["id"],
                "sectors": [rule["sector_a"], rule["sector_b"]],
                "metrics": [rule["metric_a"], rule["metric_b"]],
                "pct_changes": [round(a["pct"], 2), round(b["pct"], 2)],
                "expected": rule["expected"],
                "observed": "same_direction" if same_direction else "opposite_direction",
            })

    return anomalies


def find_contradictions(arbitrations, envelopes_by_sector):
    """Find claims that contradict each other semantically."""
    contradictions = []

    # Build metric -> [(sector, current, pct_change, confidence)]
    by_metric = {}
    for a in arbitrations:
        env = envelopes_by_sector.get(a["sector"], {})
        delta = env.get("delta") or {}
        metric = delta.get("metric")
        if not metric or metric == "none":
            continue
        canonical = METRIC_ALIASES.get(metric, metric)
        current = delta.get("current")
        pct = delta.get("pct_change")
        if current is None:
            continue
        by_metric.setdefault(canonical, []).append({
            "sector": a["sector"],
            "metric_raw": metric,
            "current": current,
            "pct_change": pct,
            "confidence": a["confidence"],
        })

    # 1. Same-metric divergence (>10% difference between two reports)
    for canonical, group in by_metric.items():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                avg = (abs(a["current"]) + abs(b["current"])) / 2
                if avg == 0:
                    continue
                divergence = abs(a["current"] - b["current"]) / avg
                if divergence > 0.10:
                    contradictions.append({
                        "type": "metric_divergence",
                        "metric": canonical,
                        "sectors": [a["sector"], b["sector"]],
                        "values": [a["current"], b["current"]],
                        "divergence_pct": round(divergence * 100, 1),
                    })

    # 2. Directional conflict (same metric, opposite significant moves)
    for canonical, group in by_metric.items():
        changes = [g for g in group if g["pct_change"] is not None]
        if len(changes) < 2:
            continue
        for i in range(len(changes)):
            for j in range(i + 1, len(changes)):
                a, b = changes[i], changes[j]
                if abs(a["pct_change"]) > 1 and abs(b["pct_change"]) > 1:
                    if (a["pct_change"] > 0) != (b["pct_change"] > 0):
                        contradictions.append({
                            "type": "directional_conflict",
                            "metric": canonical,
                            "sectors": [a["sector"], b["sector"]],
                            "changes": [round(a["pct_change"], 1), round(b["pct_change"], 1)],
                        })

    return contradictions


def sector_url(sector):
    if sector in DENSE_SECTORS:
        return f"https://sector-dense.fourieranalys.workers.dev/{sector}/signal"
    if sector in SPARSE_SECTORS:
        return f"https://sector-sparse.fourieranalys.workers.dev/{sector}/signal"
    if sector in SLOW_SECTORS:
        return f"https://sector-slow.fourieranalys.workers.dev/{sector}/signal"
    return WORKERS_BASE.format(sector) + "/signal"


def fetch_envelope(sector):
    url = sector_url(sector)
    try:
        req = urllib.request.Request(url, headers={"user-agent": "VolatiAI/1.0"})
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"sector": sector, "error": str(e)[:80]}


def build_graph(envelopes):
    nodes, edges = [], []
    for env in envelopes:
        if not env or "sector" not in env or "error" in env:
            continue
        cid = f"claim:{env['sector']}:{env.get('timestamp', '')}"
        nodes.append({
            "id": cid, "type": "claim",
            "sector": env["sector"],
            "summary": env.get("summary", ""),
            "density": env.get("density", "dense"),
            "severity": env.get("severity", "info"),
            "has_signal": env.get("has_signal", False),
        })
        src = env.get("sources", {})
        total = src.get("total", 0)
        failed = src.get("failed", [])
        healthy = total - len(failed)
        for i in range(healthy):
            sid = f"source:{env['sector']}:healthy:{i}"
            nodes.append({"id": sid, "type": "source", "sector": env["sector"]})
            edges.append({"from": sid, "to": cid, "relation": "supports", "weight": 1.0})
        for f in failed:
            sid = f"source:{env['sector']}:failed:{f}"
            nodes.append({"id": sid, "type": "source", "sector": env["sector"]})
            edges.append({"from": sid, "to": cid, "relation": "contradicts", "weight": 0.5})
    return {"nodes": nodes, "edges": edges}


def arbitrate(graph):
    results = []
    for claim in [n for n in graph["nodes"] if n["type"] == "claim"]:
        support = sum(e["weight"] for e in graph["edges"] if e["to"] == claim["id"] and e["relation"] == "supports")
        disputes = sum(e["weight"] for e in graph["edges"] if e["to"] == claim["id"] and e["relation"] == "contradicts")
        conf = support / max(support + disputes, 1)
        results.append({
            "sector": claim["sector"],
            "summary": claim["summary"],
            "density": claim["density"],
            "has_signal": claim["has_signal"],
            "support": support, "disputes": disputes, "confidence": conf,
        })
    return results


def render(arbitrations, envelopes_by_sector, contradictions=None, anomalies=None):
    lines = ["\U0001F52C <b>VolatiAI Epistemic Digest</b>", ""]

    # Conflicts first — they are the most important signal
    if contradictions:
        lines.append("\u26A1 <b>Conflicts</b>")
        for c in contradictions:
            if c["type"] == "metric_divergence":
                a, b = c["sectors"]
                va, vb = c["values"]
                lines.append(
                    f"\u26A0 {c['metric']}: {a}={va} vs {b}={vb} "
                    f"({c['divergence_pct']}% divergence)"
                )
            elif c["type"] == "directional_conflict":
                a, b = c["sectors"]
                ca, cb = c["changes"]
                lines.append(
                    f"\u26A0 {c['metric']}: {a}={ca:+.1f}% vs {b}={cb:+.1f}%"
                )
        lines.append("")

    # Correlation anomalies next
    if anomalies:
        lines.append("\U0001F500 <b>Correlation anomalies</b>")
        for a in anomalies:
            sa, sb = a["sectors"]
            pa, pb = a["pct_changes"]
            lines.append(
                f"\u26A0 {sa}={pa:+.1f}% vs {sb}={pb:+.1f}% "
                f"(expected {a['expected']})"
            )
        lines.append("")

    by_density = {"dense": [], "sparse": [], "slow": []}
    for a in arbitrations:
        d = a["density"] if a["density"] in by_density else "dense"
        by_density[d].append(a)

    icons = {"dense": "\U0001F534", "sparse": "\U0001F7E1", "slow": "\u26AA"}
    labels = {"dense": "Dense signals", "sparse": "Events", "slow": "Slow trends"}

    for d in ("dense", "sparse", "slow"):
        items = by_density[d]
        if not items:
            continue

        active = [a for a in items if a["has_signal"]]
        quiet = [a for a in items if not a["has_signal"]]

        lines.append(f"{icons[d]} <b>{labels[d]}</b>")

        active.sort(key=lambda x: -x["confidence"])
        for a in active:
            env = envelopes_by_sector.get(a["sector"], {})
            src_meta = env.get("sources", {})
            total = src_meta.get("total", 0)
            failed = src_meta.get("failed", [])
            healthy = total - len(failed)

            pct = int(round(a["confidence"] * 100))
            mark = "\u2713" if a["confidence"] >= 0.99 else "\u26A0"
            src_str = f"{healthy}/{total}"
            if failed:
                src_str += f" (missing: {', '.join(failed)})"

            lines.append(f"{mark} <b>{a['sector']}</b> ({pct}%) \u00B7 {src_str}")
            lines.append(f"   {a['summary']}")

        if quiet:
            quiet_names = ", ".join(a["sector"] for a in quiet)
            lines.append(f"\U0001F4A4 {len(quiet)} quiet: {quiet_names}")

        lines.append("")

    return "\n".join(lines)


def send(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
            return json.loads(r.read()).get("ok", False)
    except Exception as e:
        print(f"Telegram error: {e}")
        return False


def main():
    sectors = load_active_sectors()
    print(f"Fetching {len(sectors)} sectors...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        envelopes = list(ex.map(fetch_envelope, sectors))

    valid = [e for e in envelopes if e and "sector" in e and "error" not in e]
    print(f"Got {len(valid)}/{len(sectors)} envelopes")

    envelopes_by_sector = {e["sector"]: e for e in valid}
    graph = build_graph(valid)
    claims = [n for n in graph["nodes"] if n["type"] == "claim"]
    print(f"Graph: {len(claims)} claims, {len(graph['edges'])} edges")

    arb = arbitrate(graph)
    arb.sort(key=lambda x: -x["confidence"])

    contradictions = find_contradictions(arb, envelopes_by_sector)
    if contradictions:
        print(f"\nContradictions: {len(contradictions)}")
        for c in contradictions:
            print(f"  {c}")

    anomalies = find_correlation_anomalies(arb, envelopes_by_sector)
    if anomalies:
        print(f"\nCorrelation anomalies: {len(anomalies)}")
        for a in anomalies:
            print(f"  {a}")
    print("\nArbitration:")
    for a in arb:
        print(f"  {a['sector']:15s} conf={a['confidence']:.3f} sup={a['support']:.1f} dis={a['disputes']:.1f}")

    digest = render(arb, envelopes_by_sector, contradictions, anomalies)
    print("\n=== Digest ===")
    print(digest)

    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("\n(no Telegram creds — skipping send)")
        return 0

    print("\n=== Sending ===")
    ok = send(token, chat_id, digest)
    print("Sent:", ok)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
