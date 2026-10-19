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
SPARSE_SECTORS = {"develop", "news", "jobs", "open-source", "science-math", "security", "education", "events", "sports-fitness", "vehicles", "books", "music", "science", "art-design", "anime", "biology"}
SLOW_SECTORS = {"environment", "treasuries"}
WORKERS_BASE = "https://sector-{}.fourieranalys.workers.dev"


def load_active_sectors():
    with open("config/active_sectors.json") as f:
        return json.load(f)


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


def render(arbitrations, envelopes_by_sector):
    lines = ["\U0001F52C <b>VolatiAI Epistemic Digest</b>", ""]
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
    print("\nArbitration:")
    for a in arb:
        print(f"  {a['sector']:15s} conf={a['confidence']:.3f} sup={a['support']:.1f} dis={a['disputes']:.1f}")

    digest = render(arb, envelopes_by_sector)
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
