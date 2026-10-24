#!/usr/bin/env python3
"""Epistemic digest: fetch envelopes, build graph, arbitrate, render."""

import concurrent.futures
from datetime import datetime
from graph_store import snapshot, compare_to_previous
from temporal_anomalies import find_temporal_anomalies
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

DENSE_SECTORS = {"13f-holdings", "aave", "agent-census", "ai-enforcement-events", "ai-governance-records", "ai-implementation-milestones", "ai-models", "ai-news", "air-quality", "airports", "alcohol-health", "api-directory", "arweave-network", "autonomous-tech", "aviation-weather", "bank-data", "beauty", "bgp-prefixes", "bike-share", "biotech", "bitcoin-nodes", "blockchain", "bluesky-posts", "bot-activity", "botnet-c2", "box-status", "calendars", "cannabis-laws-states", "cannabis-news", "chainsights-daos", "chemistry", "china", "climate-datasets", "cloud-components", "cloud-outages", "cloud-status", "cloudflare-status", "coinrithm-overview", "commodities", "compute", "computer-networks", "construction", "crates-io", "crypto-defi", "crypto-liquidations", "crypto-market", "crypto-oi", "crypto-regulatory-feed", "crypto-regulatory-news", "cryptocurrency", "ct-certificates", "currency-ex", "cyber-threats", "data-validity", "defi-dex-volume", "defi-fees", "defi-stablecoins", "defi-yields", "depin-market", "depin-networks", "developer-activity", "devto-articles", "disease-outbreaks", "diseases", "dropbox-status", "drug-approvals", "e-commerce", "electricity", "emsc-earthquakes", "energy", "energy-carbon", "entertainment", "eu-legal-acts", "eu-open-data", "eurostat-hicp", "ev", "exchange-rate", "fed-rate", "fema-disasters", "fertilizer", "filecoin-miners", "filecoin-network", "finance", "fintech", "flux-nodes", "food-security", "form-d-filings", "forums", "frankfurter-fx", "gdacs-disasters", "generative-ai", "global-trade-regulations", "government-data", "grid-balance", "grid-demand", "grid-mix", "hazards", "hedera-blocks", "hedge-fund-monitor", "helium-hotspots", "humanitarian-aid", "infrastructure", "institutional-finance", "interop-messaging", "kaspa-blockdag", "korean-culture", "languages", "laws", "maker", "malware-families", "maritime", "mental-health", "metals", "micar-casps", "miso-grid", "monero-network", "more-cryptos", "museums", "narcotics-enforcement", "nasa-neo", "natural-disasters", "nature-observations", "networking", "ngo", "npm-search", "nport-filings", "nutrition-foods", "nws-alerts", "ocean-waves", "openfda-recalls", "openlibrary-books", "optoelectronics", "particle-physics", "philosophy", "policy-rates", "polymarket-open", "population", "privacy-monero", "privacy-zcash", "programming", "protocols-tvl", "psychedelics", "pypi-activity", "radio-stations", "refugees", "religions", "renewable-energy", "research", "rest-countries", "satellites", "scaling-l2", "science", "science-news", "shopping", "simulations", "smr", "snapshot-proposals", "space-launches", "space-news", "species-observations", "sports", "sports-scores", "stablecoin-supply", "statistics", "stocks", "swiss-federal-laws", "ted-tenders", "theoretical-cs", "tobacco-health", "tobacco-reports", "tokenization", "tracking", "transportation", "travel", "travel-events", "uk-flood-warnings", "uk-legislation", "un-governance", "unesco-sites", "universities", "usgs-streamflow", "utilities", "volcano-alerts", "vpn-mullvad", "vpn-nordvpn", "weather", "web-apps", "wikipedia-activity", "worldbank-indicators", "xbrl-frames", "yc-companies", "cisa-kev", "nvd-new-cves", "nasa-eonet", "usgs-water", "noaa-ndbc", "epa-envirofacts"}
SPARSE_SECTORS = {"anime", "art-design", "artic", "arxiv-ai", "arxiv-cs", "audius", "biology", "books", "carbon-intensity", "crossref", "cve-feed", "demographics", "depin-network", "dev-metaverse", "dev-vr-ar", "develop", "drug-recall", "earthquakes", "education", "events", "food-drink", "food-products", "free-games", "free-to-play", "geocoding", "github-trending", "gutendex", "health", "huggingface-models", "jobs", "mining", "mtg", "music", "musicbrainz", "nft", "npm-packages", "open-source", "open-source-packages", "openalex", "osv-vulnerabilities", "podcasts", "pqc-migration", "pubmed", "pypi-packages", "science", "science-math", "sec-filings", "security", "semanticscholar", "space", "spaceflight", "spaceweather", "sports", "travel", "tv", "vehicles", "water", "wikipedia", "abuse-ch-feodo"}
SLOW_SECTORS = {"frankfurter-eurusd", "frankfurter-eursek", "nbp-gold-spot", "dbnomics-us-debt", "worldbank-us-unemployment", "worldbank-us-gdp", "worldbank-se-gdp", "coingecko-btc-usd", "coinbase-btc-usd", "coingecko-sol-usd", "defillama-protocol-count", "coinbase-btc-volume24h", "gleif-leis", "phishunt-domains", "cisa-kev-count", "nvd-cve-count", "usgs-earthquakes-emsc", "treasuries-gov", "zenodo-records", "datacite-dois", "doaj-articles", "crossref-works", "noaa-spaceweather-alerts", "usgs-earthquakes", "apis-guru-directory", "cleveland-artworks", "openfda-device-recalls", "openfda-food-recalls", "openfda-drug-recalls", "ballotwatch-bills", "wikidata-triples", "tweetfeed-c2", "cern-opendata", "met-artworks", "dc-crime", "saos", "robonix", "home-assistant", "mattercatalog", "satlas", "poligraph", "arbetsformedlingen", "fhfa", "ietf-datatracker", "ripestat", "bakom", "fcc-broadband", "global-forest-watch", "faostat", "environment", "gdp", "treasuries", "unemployment", "rir-arin", "ripe-atlas-public"}
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


# Sectors in the same conflict group genuinely measure the same thing.
# Sectors NOT listed here are never compared — false positives from name
# collisions (papers_7d, works, datasets, total_tvl_usd, weekly_downloads,
# games_today) are eliminated by design, not by tuning.
CONFLICT_GROUPS = {
    "currency-ex": "fx_usd_eur",
    "exchange-rate": "fx_usd_eur",
}

# Direction normalization for FX: higher currency-ex = stronger EUR,
# higher exchange-rate (EUR→USD) = weaker USD. Negate one to compare.
# FX pairs are RECIPROCAL, not directional: exchange-rate returns
# USD→EUR (0.89) while currency-ex returns EUR→USD (1.12). Invert
# exchange-rate to align. Negation was wrong — 1.1215 vs 0.89075
# are the same rate, not 200% divergence.
CONFLICT_DIRECTION = {
    "currency-ex": "raw",
    "exchange-rate": "reciprocal",
}


def find_contradictions(arbitrations, envelopes_by_sector):
    """Find claims that contradict each other semantically."""
    contradictions = []

    # Build metric -> [(sector, current, pct_change, confidence)]
    by_metric = {}
    for a in arbitrations:
        sector = a["sector"]
        group = CONFLICT_GROUPS.get(sector)
        if not group:
            continue  # sector not in any conflict group → skip
        env = envelopes_by_sector.get(sector, {})
        delta = env.get("delta") or {}
        metric = delta.get("metric")
        if not metric or metric == "none":
            continue
        current = delta.get("current")
        pct = delta.get("pct_change")
        if current is None:
            continue
        mode = CONFLICT_DIRECTION.get(sector, "raw")
        if mode == "reciprocal" and isinstance(current, (int, float)) and current > 0:
            current = 1.0 / current
            pct = (-pct) if pct is not None else None
        elif mode == "negate" and isinstance(current, (int, float)):
            current = -current
            pct = (-pct) if pct is not None else None
        by_metric.setdefault(group, []).append({
            "sector": sector,
            "metric_raw": metric,
            "current": current,
            "pct_change": pct,
            "confidence": env.get("confidence") if env.get("confidence") is not None else a["confidence"],
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
                if divergence > 0.20:
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
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"sector": sector, "error": str(e)[:80]}



HISTORY_PATH = "data/digest_history.json"
MAX_HISTORY_RUNS = 24  # 6 days at 4 runs/day


def load_history():
    try:
        with open(HISTORY_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"runs": []}


def save_history(history):
    from pathlib import Path as _Path
    _Path(HISTORY_PATH).parent.mkdir(parents=True, exist_ok=True)
    history["runs"] = history["runs"][-MAX_HISTORY_RUNS:]
    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)


def dedupe_recent_events(arb, envelopes_by_sector, cooldown_runs=8):
    """Suppress event-type signals whose event ID fired recently.

    Cloudflare KV is eventually consistent — writes propagate across
    edges over 5-20 minutes. Digest runs hitting different edges during
    that window see stale null from KV and re-fire the same event.
    Observed: CVE-2026-0311 fired 5 times in 22 minutes.

    digest_history.json is consistent and ordered. Use it as the source
    of truth: if the same event_id fired in any of the last N runs,
    suppress it now.
    """
    history = load_history()
    recent_ids = set()
    for run in history.get("runs", [])[-cooldown_runs:]:
        for sector, data in run.get("sectors", {}).items():
            eid = data.get("event_id")
            if eid and data.get("has_signal"):
                recent_ids.add(str(eid))

    if not recent_ids:
        return arb

    suppressed = 0
    for a in arb:
        if not a.get("has_signal"):
            continue
        env = envelopes_by_sector.get(a["sector"], {})
        eid = (env.get("context") or {}).get("current_event_id")
        if eid and str(eid) in recent_ids:
            a["has_signal"] = False
            a["summary"] = "quiet"
            env["has_signal"] = False
            env["summary"] = "quiet"
            suppressed += 1

    if suppressed:
        print(f"Deduped {suppressed} recently-fired events (KV propagation lag)")
    return arb


def append_run(history, arb, envelopes_by_sector):
    timestamp = datetime.utcnow().isoformat() + "Z"
    sectors = {}
    for a in arb:
        env = envelopes_by_sector.get(a["sector"], {})
        delta = env.get("delta") or {}
        sectors[a["sector"]] = {
            "has_signal": a["has_signal"],
            "confidence": env.get("confidence") if env.get("confidence") is not None else a["confidence"],
            "severity": env.get("severity") or a.get("severity") or "info",
            "magnitude": env.get("magnitude") if env.get("magnitude") is not None else a.get("magnitude"),
            "data_quality": env.get("data_quality"),
            "delta_current": delta.get("current"),
            "metric": delta.get("metric"),
            "pct_change": delta.get("pct_change"),
            "event_id": (env.get("context") or {}).get("current_event_id"),
            "summary": env.get("summary"),
        }
    history["runs"].append({"timestamp": timestamp, "sectors": sectors})
    return history


def detect_trends(history):
    trends = []
    runs = history.get("runs", [])
    if len(runs) < 2:
        return trends

    # 1. Persistent signal: has_signal true in all of last 3+ runs
    recent = runs[-5:]
    for sector in recent[-1]["sectors"]:
        signals = [
            r["sectors"].get(sector, {}).get("has_signal")
            for r in recent
            if sector in r["sectors"]
        ]
        if len(signals) >= 3 and all(signals):
            trends.append({
                "type": "persistent_signal",
                "sector": sector,
                "runs": len(signals),
            })

    # 2. Sustained direction: same metric moved same way 3+ consecutive runs
    for sector in runs[-1]["sectors"]:
        pcts = []
        for r in reversed(runs):
            if sector not in r["sectors"]:
                break
            pct = r["sectors"][sector].get("pct_change")
            if pct is None or abs(pct) < 0.1:
                break
            pcts.append(pct)
            if len(pcts) >= 5:
                break
        if len(pcts) >= 3:
            if all(p > 0 for p in pcts):
                trends.append({
                    "type": "sustained_direction",
                    "sector": sector,
                    "direction": "up",
                    "runs": len(pcts),
                    "pct_values": [round(p, 2) for p in pcts],
                })
            elif all(p < 0 for p in pcts):
                trends.append({
                    "type": "sustained_direction",
                    "sector": sector,
                    "direction": "down",
                    "runs": len(pcts),
                    "pct_values": [round(p, 2) for p in pcts],
                })

    # 3. Silence ended: was quiet 3+ runs, now signaling
    for sector in runs[-1]["sectors"]:
        if not runs[-1]["sectors"][sector].get("has_signal"):
            continue
        quiet_count = 0
        for r in reversed(runs[:-1]):
            if sector not in r["sectors"]:
                break
            if not r["sectors"][sector].get("has_signal"):
                quiet_count += 1
            else:
                break
        if quiet_count >= 3:
            trends.append({
                "type": "silence_ended",
                "sector": sector,
                "quiet_runs": quiet_count,
            })

    return trends


def render_trends(trends):
    if not trends:
        return []
    lines = ["\U0001F4C8 <b>Trends</b>"]
    for t in trends:
        if t["type"] == "persistent_signal":
            lines.append(f"\u2197 {t['sector']}: signaling {t['runs']} runs in a row")
        elif t["type"] == "sustained_direction":
            arrow = "\u2191" if t["direction"] == "up" else "\u2193"
            vals = ", ".join(f"{v:+.1f}%" for v in t["pct_values"])
            lines.append(f"{arrow} {t['sector']}: {t['direction']} {t['runs']} runs ({vals})")
        elif t["type"] == "silence_ended":
            lines.append(f"\U0001F514 {t['sector']}: silent {t['quiet_runs']} runs, now signaling")
    lines.append("")
    return lines


def build_graph(envelopes):
    nodes, edges = [], []
    for env in envelopes:
        if not env or "sector" not in env or "error" in env:
            continue
        # Stable claim ID — no timestamp, so temporal diff works across runs
        cid = f"claim:{env['sector']}"
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


def render(arbitrations, envelopes_by_sector, contradictions=None, anomalies=None, trends=None):
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

    # Trends next
    if trends:
        lines.extend(render_trends(trends))

    by_density = {"dense": [], "sparse": [], "slow": []}
    for a in arbitrations:
        d = a["density"] if a["density"] in by_density else "dense"
        by_density[d].append(a)

    icons = {"dense": "\U0001F534", "sparse": "\U0001F7E1", "slow": "\u26AA"}
    labels = {"dense": "Dense signals", "sparse": "Events", "slow": "Slow trends"}

    for d in ("sparse", "dense", "slow"):
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
            # Just the count, not the full list — 191 names truncates the
            # message before readers reach the fired signals below
            lines.append(f"\U0001F4A4 {len(quiet)} quiet")

        lines.append("")

    return "\n".join(lines)


def send(token, chat_id, text):
    # Telegram caps messages at 4096 chars; leave buffer for HTML tags
    MAX_LEN = 4000
    if len(text) > MAX_LEN:
        cut = text[:MAX_LEN].rfind("\n")
        if cut < MAX_LEN * 0.8:
            cut = MAX_LEN
        text = text[:cut] + "\n\n\u2026 (truncated)"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
            return json.loads(r.read()).get("ok", False)
    except Exception as e:
        print(f"Telegram error: {e}")
        return False


def find_alertable(arb, history, min_silent_runs=10):
    """Return signals worth an immediate alert (separate from digest).

    Two conditions, both genuinely rare:
      - severity is warning or critical (escalation)
      - first fire after N+ silent runs (state transition)

    From history: 20 of 169 fires match. That's ~12% — real
    density, not noise.
    """
    alerts = []
    runs = history.get("runs", [])
    for a in arb:
        if not a.get("has_signal"):
            continue
        severity = a.get("severity") or "info"
        sector = a["sector"]

        if severity in ("warning", "critical"):
            alerts.append({**a, "reason": f"severity={severity}"})
            continue

        # Count consecutive silent runs (most recent first)
        silent = 0
        for run in reversed(runs):
            sector_data = run.get("sectors", {}).get(sector, {})
            if sector_data.get("has_signal"):
                break
            silent += 1
        if silent >= min_silent_runs:
            alerts.append({**a, "reason": f"first fire after {silent} silent runs"})

    return alerts


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
    arb = dedupe_recent_events(arb, envelopes_by_sector)

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

    # History + trends
    history = load_history()
    # Alerts need pre-append history so the current run doesn't count as
    # "already firing" when checking silence. Compute here, use later.
    alerts = find_alertable(arb, history)
    history = append_run(history, arb, envelopes_by_sector)
    trends = detect_trends(history)
    if trends:
        print(f"\nTrends: {len(trends)}")
        for t in trends:
            print(f"  {t}")
    save_history(history)
    try:
        from scripts.briefing import write_briefing
        write_briefing(path="docs/briefing.json")
        print("Wrote docs/briefing.json")
        from scripts.rss import generate_feed
        generate_feed(briefing_path="docs/briefing.json", output_path="docs/feed.xml")
        print("Wrote docs/feed.xml")
    except Exception as e:
        print(f"briefing write failed: {e}")

    # Persistent graph snapshot
    graph_diff = None
    try:
        graph_diff = compare_to_previous(graph)
        snapshot(graph)
        print(f"\nGraph snapshot: {len(graph.get('nodes', []))} nodes, {len(graph.get('edges', []))} edges")

        # Temporal anomalies (uses the snapshot we just saved)
        temporal = find_temporal_anomalies()
        if temporal.get("status") == "ok" and temporal.get("total", 0) > 0:
            print(f"  Temporal anomalies: {temporal['total']}")
            for a in temporal.get("silent_changes", [])[:3]:
                print(f"    silent change: {a['sector']} '{a['prev_summary']}' → '{a['curr_summary']}'")
            for a in temporal.get("silent_drops", [])[:3]:
                print(f"    silent drop: {a['sector']} (last: '{a['last_summary']}')")
            for a in temporal.get("silent_appearances", [])[:3]:
                print(f"    silent appearance: {a['sector']} '{a['summary']}'")
        if graph_diff.get("status") == "no_previous_snapshot":
            print("  (first snapshot — no diff)")
        else:
            print(f"  snapshot #{graph_diff.get('snapshot_age_runs', 0)}: new={graph_diff.get('new_claims', 0)} dropped={graph_diff.get('dropped_claims', 0)} persisted={graph_diff.get('persisted', 0)}")
        if graph_diff.get("changed"):
            print(f"  Changed claims: {len(graph_diff['changed'])}")
            for c in graph_diff["changed"][:5]:
                print(f"    {c['sector']}: '{c['prev_summary']}' → '{c['curr_summary']}'")
    except Exception as e:
        print(f"Graph snapshot failed: {e}")
    print("\nArbitration:")
    for a in arb:
        print(f"  {a['sector']:15s} conf={a['confidence']:.3f} sup={a['support']:.1f} dis={a['disputes']:.1f}")

    digest = render(arb, envelopes_by_sector, contradictions, anomalies, trends)
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

    # Separate alert channel: fires only on warning/critical severity
    # or first fire after 10+ silent runs. Empirically ~12% of fires.
    try:
        if alerts:
            alert_lines = ["\U0001F6A8 <b>VolatiAI Alert</b>", ""]
            for al in alerts:
                sector = al["sector"]
                summary = (al.get("summary") or "")[:120]
                alert_lines.append(f"<b>{sector}</b> \u2014 {al['reason']}")
                if summary and summary != "quiet":
                    alert_lines.append(f"  {summary}")
                alert_lines.append("")
            send(token, chat_id, "\n".join(alert_lines))
            print(f"Alert sent: {len(alerts)} signal(s)")
    except Exception as e:
        print(f"Alert channel failed (non-fatal): {e}")
    # History persistence + graph publishing are the essential outputs.
    # Telegram is best-effort — a failed notification should not fail the
    # workflow, because the digest content still needs to reach consumers
    # via dashboard/history.
    return 0


if __name__ == "__main__":
    sys.exit(main())
