#!/usr/bin/env python3
"""Unified briefing.json — single structured output for all consumers.

Combines:
  - narrative.py (headline, domain groups, watchlist)
  - delta.py (comparison to previous run)
  - digest_history.json (raw signals)

Output: docs/briefing.json
"""

import json
from pathlib import Path

from scripts.narrative import summarize
from scripts.delta import delta as compute_delta


DOMAINS = {
    "energy": {"carbon-intensity", "energy-grid", "grid-mix", "grid-balance",
               "grid-demand", "electricity", "energy", "energy-carbon"},
    "security": {"cve-feed", "security", "cyber-threats", "botnet-c2",
                 "malware-families", "pqc-migration", "osv-vulnerabilities"},
    "crypto": {"depin-network", "crypto-oi", "crypto-market", "crypto-defi",
               "protocols-tvl", "stablecoin-supply", "bitcoin-nodes",
               "privacy-monero", "privacy-zcash", "monero-network",
               "snapshot-proposals"},
    "information": {"news", "hackernews", "events", "develop", "npm-packages",
                    "pypi-activity", "arxiv-ai", "arxiv-cs", "podcasts",
                    "github-trending", "wikipedia"},
    "health": {"diseases", "drug-approvals", "mental-health", "biotech",
               "openfda-recalls", "disease-outbreaks"},
    "environment": {"water", "hazards", "air-quality", "natural-disasters",
                    "usgs-streamflow", "earthquakes", "fema-disasters",
                    "gdacs-disasters", "uk-flood-warnings", "volcano-alerts",
                    "nws-alerts", "emsc-earthquakes"},
    "space": {"spaceweather", "space-news", "satellites", "space-launches",
              "nasa-neo"},
    "sports": {"sports-fitness", "sports", "sports-scores"},
}


def domain_of(sector):
    for domain, sectors in DOMAINS.items():
        if sector in sectors:
            return domain
    return "other"


def quiet_headline(sectors, fired):
    """Produce a headline for briefing.json, whether or not any signals fired.

    When fired is empty, ranks sectors by |pct_change| and names the one
    closest to firing — so a quiet day still says something true instead
    of "0 signals" or null.
    """
    if fired:
        return f"{len(fired)} signals"
    if not sectors:
        return "no data"
    ranked = []
    for name, d in sectors.items():
        pc = d.get("pct_change")
        if pc is None:
            continue
        ranked.append((name, d, abs(pc)))
    ranked.sort(key=lambda x: -x[2])
    if not ranked:
        return f"{len(sectors)} sectors monitored, all quiet"
    name, d, _ = ranked[0]
    thr = d.get("threshold_pct")
    pc = d.get("pct_change")
    if thr is not None and pc is not None:
        return (f"{len(sectors)} sectors monitored, all quiet. "
                f"Closest: {name} {pc:+.2f}% vs {thr}% threshold")
    return f"{len(sectors)} sectors monitored, all quiet. Closest: {name} {pc:+.2f}%"

def build_briefing():
    """Assemble the unified briefing object."""
    with open("data/digest_history.json") as f:
        history = json.load(f)

    runs = history.get("runs", [])
    if not runs:
        return None

    current = runs[-1]
    sectors = current.get("sectors", {})
    fired = {name: d for name, d in sectors.items() if d.get("has_signal")}

    # Briefing
    by_domain = {}
    for name in fired:
        d = domain_of(name)
        by_domain.setdefault(d, {"count": 0, "sectors": []})
        by_domain[d]["count"] += 1
        by_domain[d]["sectors"].append(name)

    # Fire counts over 24 runs
    window = runs[-24:]
    fire_counts = {}
    for run in window:
        for name, data in (run.get("sectors") or {}).items():
            if data.get("has_signal"):
                fire_counts[name] = fire_counts.get(name, 0) + 1

    # Signals array (detailed)
    signals = []
    for name, data in sorted(fired.items(), key=lambda x: -(x[1].get("confidence") or 0)):
        signals.append({
            "sector": name,
            "severity": data.get("severity", "notice"),
            "summary": data.get("summary", ""),
            "confidence": data.get("confidence") or 0,
            "magnitude": data.get("magnitude"),
            "pct_change": data.get("pct_change"),
            "fires_24": fire_counts.get(name, 0),
        })

    # Delta
    d = compute_delta(history) or {}

    # Watchlist from narrative
    narrative = summarize(history) or {}

    return {
        "sector": "volati-ai",
        "ts": (current.get("timestamp") or "")[:19] + "Z",
        "run_number": len(runs),
        "briefing": {
            "headline": narrative.get("headline") or quiet_headline(sectors, fired),
            "by_domain": by_domain,
        },
        "signals": signals,
        "delta": {
            "previous_ts": d.get("previous_ts"),
            "signals_before": d.get("previous_count"),
            "signals_after": d.get("current_count"),
            "new": d.get("new_signals", []),
            "dropped": d.get("dropped", []),
            "persistent": d.get("persistent", []),
            "movements": d.get("movements", []),
        } if d else None,
        "watchlist": narrative.get("watchlist", []),
        "stats": {
            "total_sectors": len(sectors),
            "firing_sectors": len(fired),
            "fire_rate_pct": round(100.0 * len(fired) / len(sectors), 2) if sectors else 0,
            "runs_in_history": len(runs),
        },
    }


def write_briefing(path="docs/briefing.json"):
    briefing = build_briefing()
    if not briefing:
        print("no history — skipping")
        return None

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(briefing, f, indent=2)

    print(f"Wrote {path}")
    print(f"  headline: {briefing['briefing']['headline']}")
    print(f"  signals: {len(briefing['signals'])}")
    if briefing.get("delta"):
        print(f"  delta: {briefing['delta']['signals_before']} → {briefing['delta']['signals_after']}")
    print(f"  watchlist: {len(briefing.get('watchlist', []))} sectors")
    return briefing


if __name__ == "__main__":
    write_briefing()
