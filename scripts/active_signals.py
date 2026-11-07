#!/usr/bin/env python3
"""Rank active signals from the latest snapshot.

Outputs docs/active.json — a small, product-quality payload of the
top N signals ordered by severity x confidence x magnitude x novelty.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

TOP_N = 25
SNAPSHOT_PATH = Path("docs/graph_snapshot.json")
INTEL_HTML_PATH = Path("docs/intel.html")
HISTORY_PATH = Path("reports/signal_history.jsonl")
OUTPUT_PATH = Path("docs/active.json")

SEVERITY_OVERRIDES = {
    "weather": "notice",
    "7timer-berlin-temp": "notice",
}

SEVERITY_WEIGHT = {
    "info": 0.1,
    "notice": 1.0,
    "warning": 2.0,
    "alert": 3.0,
    "critical": 5.0,
}

ZERO_OK_SUFFIXES = ("_warnings", "_alerts", "_incidents", "_events", "_deals", "_count", "quakes")


def load_sectors() -> list[dict]:
    if SNAPSHOT_PATH.exists():
        raw = json.loads(SNAPSHOT_PATH.read_text())
        if isinstance(raw, dict) and "sectors" in raw:
            return raw["sectors"]
        if isinstance(raw, list):
            return raw
        for k in ("data", "results", "items"):
            if isinstance(raw.get(k), list):
                return raw[k]

    if INTEL_HTML_PATH.exists():
        import re
        html = INTEL_HTML_PATH.read_text()
        m = re.search(r"<pre>(.*?)</pre>", html, re.DOTALL)
        if m:
            return json.loads(m.group(1))

    raise SystemExit("No sector source found")


def load_history() -> dict:
    history: dict = {}
    if not HISTORY_PATH.exists():
        return history
    for line in HISTORY_PATH.read_text().splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        sector = rec.get("sector")
        ts = rec.get("timestamp") or rec.get("ts")
        if not sector or not ts:
            continue
        try:
            when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if sector not in history or when > history[sector]:
            history[sector] = when
    return history


def is_plausible(d: dict) -> bool:
    src = d.get("sources", {})
    if src.get("total", 0) > 0 and src.get("healthy", 0) == 0:
        return False
    if d.get("data_quality", 1.0) < 0.5:
        return False
    delta = d.get("delta") or {}
    cur = delta.get("current")
    prev = delta.get("previous")
    metric = delta.get("metric", "") or ""
    if cur == 0 and isinstance(prev, (int, float)) and prev >= 1000:
        if not any(metric.endswith(s) for s in ZERO_OK_SUFFIXES):
            return False
    return True


def novelty_factor(sector: str, history: dict) -> float:
    last = history.get(sector)
    if last is None:
        return 1.0
    now = datetime.now(timezone.utc)
    age_hours = (now - last).total_seconds() / 3600
    if age_hours < 6:
        return 0.3
    if age_hours < 24:
        return 0.6
    if age_hours < 7 * 24:
        return 0.85
    return 1.0


def score(d: dict, history: dict) -> float:
    sev_name = SEVERITY_OVERRIDES.get(d.get("sector", ""), d.get("severity", "info"))
    sev = SEVERITY_WEIGHT.get(sev_name, 1.0)
    conf = d.get("confidence", 0.0) or 0.0
    mag = d.get("magnitude", 0.0) or 0.0
    if mag == 0:
        delta = d.get("delta") or {}
        pct = delta.get("pct_change")
        if isinstance(pct, (int, float)) and pct != 0:
            mag = abs(pct) * 0.1
    nov = novelty_factor(d.get("sector", ""), history)
    return sev * conf * math.sqrt(mag + 0.1) * nov



# --- Bot message formatting ---

CATEGORIES = [
    ("🛡️ Security",     ("nvd-", "cisa-", "phishunt", "tweetfeed", "cve-", "osv-", "cyber-", "security")),
    ("₿ Crypto",        ("kraken-", "defi-", "stablecoin", "dex-", "coinrithm", "blockchain", "cryptocurrency", "web3-", "nft", "gemini-")),
    ("🌍 Environment",  ("uk-carbon", "energinet", "nws-", "usgs-", "noaa-", "gdacs", "nasa-eonet", "nature-", "obis-", "climate-", "weather", "wttr-", "7timer-")),
    ("💻 Tech",         ("hackernews-", "pypi-", "npm-", "github-", "open-digger", "devto-", "mastodon-", "bluesky-", "huggingface-")),
    ("📊 Markets",      ("treasur", "fed-", "fred-", "frankfurter", "exchange-rate", "policy-", "eurostat", "eia-", "worldbank", "fhfa", "dbnomics")),
    ("🏥 Health",       ("pubmed", "europepmc", "corona", "disease", "openfda", "cdc-", "who-", "clinicaltrials")),
    ("🏛️ Governance",  ("ballotwatch", "un-", "swiss-", "eu-", "micar", "regulatory", "courtlistener", "poligraph", "laws")),
    ("🔷 Other",        ()),
]


def categorize(sector: str) -> str:
    s = (sector or "").lower()
    for label, prefixes in CATEGORIES:
        if not prefixes:
            return label
        if any(s.startswith(p) or p in s for p in prefixes):
            return label
    return "🔷 Other"


METRIC_LABELS = {
    "new_cves": "new CVEs",
    "weekly_c2_ips": "C2 IPs seen this week",
    "active_phishings": "active phishing domains",
    "gco2_per_kwh": "grid carbon intensity (gCO2/kWh)",
    "count": "events",
    "quakes": "significant quakes",
    "m45_count": "M4.5+ quakes",
    "temp_c": "temperature (°C)",
    "top10_score_sum": "HN top-10 score sum",
    "downloads": "downloads",
    "openrank": "OpenRank score",
    "per_100k": "cases per 100k",
    "eth_24h": "ETH DEX volume 24h (USD)",
    "dot_usd": "DOT price (USD)",
    "sol_usd": "SOL price (USD)",
    "ada_usd": "ADA price (USD)",
    "xrp_usd": "XRP price (USD)",
    "packages": "tracked packages",
    "all_auctions_lots_count": "auction lots",
    "certified_products": "certified products",
    "crime_incidents": "reported incidents",
}


def fmt_number(v) -> str:
    if v is None:
        return "—"
    if not isinstance(v, (int, float)):
        return str(v)
    if abs(v) >= 1_000_000_000:
        return f"{v/1_000_000_000:.1f}B"
    if abs(v) >= 1_000_000:
        return f"{v/1_000_000:.1f}M"
    if abs(v) >= 10_000:
        return f"{v/1_000:.0f}K"
    if abs(v) >= 100:
        return f"{v:.0f}"
    return f"{v:.2f}".rstrip("0").rstrip(".")


def format_line(s: dict, is_top: bool = False) -> str:
    marker = "★ " if is_top else "  "
    d = s.get("delta") or {}
    metric = d.get("metric", "")
    label = METRIC_LABELS.get(metric, metric.replace("_", " "))

    if not label and not d.get("current") is not None:
        # Fall back to summary if delta is missing
        return marker + (s.get("summary") or "(no data)")

    cur = fmt_number(d.get("current"))
    pct = d.get("pct_change")

    if pct is None or pct == 0:
        return f"{marker}{label}: {cur}"

    direction = "↑" if pct > 0 else "↓"
    pct_str = f"{abs(pct):.0f}%" if abs(pct) >= 100 else f"{abs(pct):.1f}%"
    return f"{marker}{label}: {cur} ({direction}{pct_str})"


def format_bot_message(payload: dict, max_per_category: int = 5) -> str:
    signals = payload.get("signals", [])
    if not signals:
        return "VolatiAI — no active signals this window\n\n— automated · info only"

    ts = (payload.get("generated_at") or "")[:19].replace("T", " ")
    groups: dict = {}
    for i, s in enumerate(signals):
        cat = categorize(s.get("sector", ""))
        groups.setdefault(cat, []).append((i, s))

    lines = [f"VolatiAI — {len(signals)} signals · {ts} UTC", ""]
    top_sector = signals[0].get("sector") if signals else None

    for label, _ in CATEGORIES:
        if label not in groups:
            continue
        items = groups[label][:max_per_category]
        lines.append(label)
        for _, s in items:
            is_top = s.get("sector") == top_sector
            lines.append(format_line(s, is_top))
        lines.append("")

    lines.append("— automated · info only · attribution at volati.ai")
    return "\n".join(lines)


def main() -> None:
    sectors = load_sectors()
    history = load_history()
    candidates = []
    for s in sectors:
        d = s.get("data") if "data" in s else s
        if not d or not d.get("has_signal"):
            continue
        if not is_plausible(d):
            continue
        sc = score(d, history)
        if sc <= 0:
            continue
        candidates.append({
            "sector": d.get("sector"),
            "severity": SEVERITY_OVERRIDES.get(d.get("sector", ""), d.get("severity", "info")),
            "magnitude": d.get("magnitude"),
            "confidence": d.get("confidence"),
            "summary": d.get("summary"),
            "delta": d.get("delta"),
            "score": round(sc, 3),
            "timestamp": d.get("timestamp"),
            "attribution": "https://christianscode1994.github.io/VolatiAI/attribution.json",
        })
    candidates.sort(key=lambda c: c["score"], reverse=True)
    top = candidates[:TOP_N]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "window": "6h",
        "scanned": len(sectors),
        "candidates": len(candidates),
        "count": len(top),
        "signals": top,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    TEXT_PATH = OUTPUT_PATH.with_suffix(".txt")
    TEXT_PATH.write_text(format_bot_message(payload))
    print(f"Wrote {TEXT_PATH}")
    print(f"Wrote {len(top)} active signals (of {len(sectors)} scanned, {len(candidates)} passed plausibility)")
    for row in top[:5]:
        print(f"  {row['score']:>5.2f}  [{row['severity']:<8}] {row['sector']:<30} {row['summary']}")


if __name__ == "__main__":
    main()
