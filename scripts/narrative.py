#!/usr/bin/env python3
"""Narrative synthesis from digest_history.json.

Takes the 10 fired signals and produces:
- A headline summary sentence
- Per-domain grouped interpretation
- A watchlist of sectors with historical volatility but currently quiet
"""

import json
import statistics
from pathlib import Path


# Map sectors to domains for grouping
DOMAINS = {
    "energy": ["carbon-intensity", "energy-grid", "grid-mix", "grid-balance",
               "grid-demand", "electricity", "energy", "energy-carbon"],
    "security": ["cve-feed", "security", "cyber-threats", "botnet-c2",
                 "malware-families", "pqc-migration", "osv-vulnerabilities"],
    "crypto": ["depin-network", "crypto-oi", "crypto-market", "crypto-defi",
               "protocols-tvl", "defi-tvl", "stablecoin-supply", "bitcoin-nodes",
               "privacy-monero", "privacy-zcash", "monero-network"],
    "information": ["news", "hackernews", "events", "develop", "npm-packages",
                    "pypi-activity", "arxiv-ai", "arxiv-cs", "podcasts",
                    "github-trending", "wikipedia"],
    "health": ["diseases", "drug-approvals", "mental-health", "biotech",
               "openfda-recalls", "disease-outbreaks", "drug-recall"],
    "environment": ["water", "hazards", "air-quality", "natural-disasters",
                    "usgs-streamflow", "earthquakes", "fema-disasters",
                    "gdacs-disasters", "uk-flood-warnings", "volcano-alerts",
                    "nws-alerts", "emsc-earthquakes"],
    "space": ["spaceweather", "space-news", "satellites", "space-launches",
              "nasa-neo"],
    "sports": ["sports-fitness", "sports", "sports-scores"],
    "climate": ["renewable-energy", "infrastructure", "population"],
    "other": [],
}


def domain_of(sector):
    for domain, sectors in DOMAINS.items():
        if sector in sectors:
            return domain
    return "other"


def load_history(path="data/digest_history.json"):
    with open(path) as f:
        return json.load(f)


def summarize(history):
    runs = history.get("runs", [])
    if not runs:
        return None

    last = runs[-1]
    sectors = last.get("sectors", {})
    fired = {name: data for name, data in sectors.items() if data.get("has_signal")}

    # Group fired by domain
    by_domain = {}
    for name, data in fired.items():
        d = domain_of(name)
        by_domain.setdefault(d, []).append({"name": name, **data})

    # Headline
    total_sectors = len(sectors)
    fire_count = len(fired)
    ts = (last.get("timestamp") or "")[:16].replace("T", " ")

    # Compute dominant domain
    domain_counts = sorted(by_domain.items(), key=lambda x: -len(x[1]))
    dominant = domain_counts[0] if domain_counts else (None, [])

    headline = f"{fire_count} signal{'s' if fire_count != 1 else ''} across {total_sectors} sectors evaluated"

    # Domain-specific descriptions
    descriptions = []
    for domain, items in domain_counts:
        names = [i["name"] for i in items]
        summaries = [i.get("summary", "") for i in items if i.get("summary")]

        if domain == "energy":
            descriptions.append(f"⚡ Energy: {len(items)} signal{'s' if len(items) != 1 else ''} — "
                                f"{', '.join(names)}")
        elif domain == "security":
            cves = [s for s in summaries if "CVE" in s]
            desc = f"🔒 Security: {len(items)} signal{'s' if len(items) != 1 else ''}"
            if cves:
                desc += f" (includes CVE publication)"
            descriptions.append(desc)
        elif domain == "information":
            descriptions.append(f"📰 Information: {len(items)} new item{'s' if len(items) != 1 else ''} — "
                                f"{', '.join(names)}")
        elif domain == "environment":
            descriptions.append(f"🌊 Environment: {len(items)} signal{'s' if len(items) != 1 else ''} — "
                                f"{', '.join(names)}")
        elif domain == "crypto":
            descriptions.append(f"🪙 Crypto: {len(items)} signal{'s' if len(items) != 1 else ''} — "
                                f"{', '.join(names)}")
        elif domain == "space":
            descriptions.append(f"🛰️ Space: {len(items)} signal{'s' if len(items) != 1 else ''}")
        elif domain == "sports":
            descriptions.append(f"🏈 Sports: {len(items)} signal{'s' if len(items) != 1 else ''}")
        elif domain != "other":
            descriptions.append(f"{domain.title()}: {', '.join(names)}")
        else:
            descriptions.append(f"Other: {', '.join(names)}")

    # Watchlist: sectors with historical avg >0.1% but currently quiet
    window = runs[-24:] if len(runs) > 24 else runs
    watchlist = []
    for name, data in sectors.items():
        if data.get("has_signal"):
            continue
        pcts = []
        for run in window:
            pd = run.get("sectors", {}).get(name, {})
            p = pd.get("pct_change")
            if isinstance(p, (int, float)) and abs(p) > 0:
                pcts.append(abs(p))
        if not pcts:
            continue
        avg = statistics.mean(pcts)
        if avg >= 0.1:
            watchlist.append({
                "sector": name,
                "avg_volatility": round(avg, 2),
                "max_volatility": round(max(pcts), 2),
                "fires_in_window": sum(1 for r in window
                                       if r.get("sectors", {}).get(name, {}).get("has_signal")),
            })

    watchlist.sort(key=lambda x: -x["avg_volatility"])

    return {
        "timestamp": ts,
        "headline": headline,
        "fire_count": fire_count,
        "total_sectors": total_sectors,
        "dominant_domain": dominant[0] if dominant[0] else None,
        "domain_descriptions": descriptions,
        "watchlist": watchlist[:10],  # top 10
    }


def format_html(narrative):
    """Produce HTML section for the dashboard."""
    if not narrative:
        return ""

    html = f'''
  <div class="card" style="border-left-color: #66fcf1; margin-bottom: 1.5rem;">
    <div class="label">Briefing — {narrative["timestamp"]}Z</div>
    <div style="font-size: 1.1rem; color: #66fcf1; margin: 0.5rem 0; line-height: 1.5;">
      {narrative["headline"]}
    </div>
    <ul style="margin: 0.5rem 0; padding-left: 1.2rem; color: #c5c6c7; line-height: 1.8;">
'''
    for desc in narrative["domain_descriptions"]:
        html += f'      <li>{desc}</li>\n'

    html += '''    </ul>
  </div>
'''

    if narrative["watchlist"]:
        html += '''
  <h2>Watchlist — high historical volatility, currently quiet</h2>
  <table>
    <tr><th>#</th><th>Sector</th><th>Avg vol</th><th>Max vol</th><th>Fires (24)</th></tr>
'''
        for i, w in enumerate(narrative["watchlist"], 1):
            html += (f'    <tr><td>{i}</td><td>{w["sector"]}</td>'
                    f'<td>{w["avg_volatility"]}%</td>'
                    f'<td>{w["max_volatility"]}%</td>'
                    f'<td>{w["fires_in_window"]}</td></tr>\n')
        html += '  </table>\n'

    return html


def main():
    history = load_history()
    narrative = summarize(history)
    if not narrative:
        print("No runs in history")
        return

    print(f"=== {narrative['timestamp']}Z ===")
    print(narrative["headline"])
    print()
    for desc in narrative["domain_descriptions"]:
        print(f"  {desc}")
    print()
    if narrative["watchlist"]:
        print("Watchlist (avg vol >0.1%, currently quiet):")
        for w in narrative["watchlist"]:
            print(f"  {w['sector']:30} avg {w['avg_volatility']}%  "
                  f"max {w['max_volatility']}%  fires {w['fires_in_window']}")


if __name__ == "__main__":
    main()
