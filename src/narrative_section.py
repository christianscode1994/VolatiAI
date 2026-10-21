"""Keyless narrative + sentiment sections for the VolatiAI dashboard.
No secrets, no KV, no state. Called once per HTML generation."""

from scripts.narrative import summarize as summarize_narrative, format_html as format_narrative_html

import re
import requests


def _get(url, timeout=10):
    try:
        r = requests.get(url, timeout=timeout, headers={"accept": "application/json"})
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def _fetch_crypto_rss(limit=40):
    """Keyless crypto news → crude lexicon score."""
    feeds = [
        "https://cointelegraph.com/rss",
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "https://decrypt.co/feed",
    ]
    pos = re.compile(r"(surge|rally|record|gain|bull|approve|launch|partner|adopt)", re.I)
    neg = re.compile(r"(crash|hack|exploit|drop|bear|ban|sue|lawsuit|delay)", re.I)
    titles = []
    for url in feeds:
        try:
            r = requests.get(url, timeout=10, headers={"User-Agent": "VolatiAI/1.0"})
            if r.status_code != 200:
                continue
            for m in re.finditer(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", r.text, re.S):
                t = m.group(1).strip()
                if not t or re.match(r"^(<?xml|rss|cointelegraph|coindesk|decrypt)", t, re.I):
                    continue
                titles.append(t)
        except Exception:
            continue
    titles = titles[:limit]
    if not titles:
        return 0.0, 0
    score = sum(1 if pos.search(t) else -1 if neg.search(t) else 0 for t in titles)
    return score / len(titles), len(titles)


def build_live_signals_section(digest_history_path=None):
    """Live signals from the latest epistemic digest run.
    Reads data/digest_history.json and renders fired sectors."""
    import json
    import os

    if digest_history_path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        digest_history_path = os.path.join(here, "..", "data", "digest_history.json")

    try:
        with open(digest_history_path) as f:
            history = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return ""

    runs = history.get("runs", [])
    if not runs:
        return ""

    last_run = runs[-1]
    sectors = last_run.get("sectors", {})
    ts = (last_run.get("timestamp") or "unknown")[:19]

    firing = [(name, data) for name, data in sectors.items() if data.get("has_signal")]

    # Compute fire rate per sector over the last 24 runs
    window = runs[-24:]
    fire_counts = {}
    for run in window:
        for name, data in run.get("sectors", {}).items():
            if data.get("has_signal"):
                fire_counts[name] = fire_counts.get(name, 0) + 1
    total_runs = len(window)

    if not firing:
        return f"""
  <h2>Live Signals</h2>
  <div class="card">
    <div class="label">Last digest run: {ts}Z</div>
    <div class="value"><span class="pill pill-neutral">quiet</span></div>
    <div class="sub">0 of {len(sectors)} sectors firing</div>
  </div>
"""

    rows = ""
    for name, data in sorted(firing, key=lambda x: -(x[1].get("confidence") or 0)):
        sev = data.get("severity") or "notice"
        sev_pill = {
            "critical": "pill-bear",
            "warning":  "pill-bear",
            "notice":   "pill-neutral",
            "info":     "pill-neutral",
        }.get(sev, "pill-neutral")

        # Prefer summary text, fall back to metric + pct
        summary = data.get("summary") or ""
        if summary and summary != "quiet":
            display = summary[:80] + ("…" if len(summary) > 80 else "")
        else:
            metric = data.get("metric") or "\u2014"
            pct = data.get("pct_change")
            if pct is not None:
                display = f"{metric} {pct:+.2f}%"
            else:
                display = metric

        fire_rate = f"{fire_counts.get(name, 0)}/{total_runs}"
        conf = data.get("confidence") or 0
        conf_pct = int(round(conf * 100))

        rows += f"""
    <tr>
      <td><span class="pill {sev_pill}">{sev}</span></td>
      <td>{name}</td>
      <td style="text-align:left; font-size:0.85rem;">{display}</td>
      <td>{fire_rate}</td>
      <td>{conf_pct}%</td>
    </tr>"""

    return f"""
  <h2>Live Signals ({len(firing)} firing)</h2>
  <div class="updated">Last digest run: {ts}Z</div>
  <table>
    <tr><th>Sev</th><th>Sector</th><th>What</th><th>Fires</th><th>Conf</th></tr>
    {rows}
  </table>
"""


def build_digest_briefing():
    """High-level narrative summary at top of dashboard.
    Reads digest_history.json, produces 2-3 sentence briefing + watchlist."""
    try:
        from pathlib import Path
        import json
        history_path = Path(__file__).resolve().parent.parent / "data" / "digest_history.json"
        with open(history_path) as f:
            history = json.load(f)
        narrative = summarize_narrative(history)
        return format_narrative_html(narrative)
    except Exception as e:
        return f'''
  <div class="card" style="border-left-color: #ff6b6b; margin-bottom: 1.5rem;">
    <div class="label">Briefing</div>
    <div class="value">unavailable</div>
    <div class="sub">{e}</div>
  </div>
'''


def build_narrative_sections():
    """HTML for Crypto Sentiment / DeFi TVL / Trending NFTs."""

    # --- Fear & Greed ---
    fg = _get("https://cryptocurrency.cv/api/fear-greed") or {}
    fgi_val   = fg.get("current", {}).get("value")
    fgi_cls   = fg.get("current", {}).get("valueClassification", "Neutral")
    fgi_trend = fg.get("trend", {})
    pill_map = {
        "Extreme Fear": "pill-bear", "Fear": "pill-bear",
        "Neutral": "pill-neutral",
        "Greed": "pill-bull", "Extreme Greed": "pill-bull",
    }
    fgi_pill = pill_map.get(fgi_cls, "pill-neutral")

    # --- Crypto RSS sentiment ---
    rss_score, rss_count = _fetch_crypto_rss()
    if rss_score > 0.3:     rss_label, rss_pill = "bull",    "pill-bull"
    elif rss_score < -0.3:  rss_label, rss_pill = "bear",    "pill-bear"
    else:                   rss_label, rss_pill = "neutral", "pill-neutral"

    # --- DeFi TVL ---
    protocols = _get("https://api.llama.fi/protocols", timeout=15) or []
    protocols = sorted(protocols, key=lambda p: p.get("tvl") or 0, reverse=True)[:10]

    # --- Trending NFTs ---
    nft_data = _get("https://api.coingecko.com/api/v3/search/trending") or {}
    nfts = nft_data.get("nfts", [])[:10]

    parts = []

    parts.append(f'''
  <h2>Crypto Sentiment</h2>
  <div class="grid">
    <div class="card">
      <div class="label">Fear &amp; Greed Index</div>
      <div class="value"><span class="pill {fgi_pill}">{fgi_cls}</span></div>
      <div class="sub">{fgi_val if fgi_val is not None else "—"}/100 · 7d avg {fgi_trend.get("averageValue7d", "—")} · trend {fgi_trend.get("direction", "—")}</div>
    </div>
    <div class="card">
      <div class="label">Crypto News (RSS)</div>
      <div class="value"><span class="pill {rss_pill}">{rss_label}</span></div>
      <div class="sub">avg {rss_score:+.3f} across {rss_count} headlines</div>
    </div>
  </div>
''')

    if protocols:
        rows = "".join(
            f"<tr><td>{i+1}</td><td>{p.get('name','?')}</td>"
            f"<td>{p.get('category','—')}</td>"
            f"<td>${(p.get('tvl') or 0)/1e9:.2f}B</td></tr>"
            for i, p in enumerate(protocols)
        )
        parts.append(f'''
  <h2>DeFi TVL Leaders</h2>
  <table>
    <tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th></tr>
    {rows}
  </table>
''')

    if nfts:
        def _floor(n):
            d = n.get("data") or {}
            return d.get("floor_price", "—")
        rows = "".join(
            f"<tr><td>{i+1}</td><td>{n.get('name','?')}</td>"
            f"<td>{n.get('symbol','—')}</td><td>{_floor(n)}</td></tr>"
            for i, n in enumerate(nfts)
        )
        parts.append(f'''
  <h2>Trending NFTs</h2>
  <table>
    <tr><th>#</th><th>Collection</th><th>Symbol</th><th>Floor</th></tr>
    {rows}
  </table>
''')

    return "".join(parts)


def write_narrative_snapshot(path="private/narrative_latest.json"):
    """Persist the narrative data as JSON for the bot to read.
    Mirrors the same sources that feed the HTML dashboard."""
    import json
    import os
    from datetime import datetime

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    fg = _get("https://cryptocurrency.cv/api/fear-greed") or {}
    cur = fg.get("current", {})
    trend = fg.get("trend", {})

    rss_score, rss_count = _fetch_crypto_rss()
    if rss_score > 0.3:     rss_label = "bull"
    elif rss_score < -0.3:  rss_label = "bear"
    else:                   rss_label = "neutral"

    protocols = _get("https://api.llama.fi/protocols", timeout=15) or []
    protocols = sorted(protocols, key=lambda p: p.get("tvl") or 0, reverse=True)[:5]

    nft_data = _get("https://api.coingecko.com/api/v3/search/trending") or {}
    nfts = nft_data.get("nfts", [])[:5]

    snap = {
        "timestamp": datetime.utcnow().isoformat(),
        "fgi_value":  cur.get("value"),
        "fgi_class":  cur.get("valueClassification", "Neutral"),
        "fgi_trend":  trend.get("direction"),
        "fgi_avg7d":  trend.get("averageValue7d"),
        "rss_score":  round(rss_score, 4),
        "rss_label":  rss_label,
        "rss_count":  rss_count,
        "defi_top": [
            {"name": p.get("name"), "category": p.get("category"),
             "tvl_b": round((p.get("tvl") or 0) / 1e9, 2)}
            for p in protocols
        ],
        "nft_trending": [
            {"name": n.get("name"), "symbol": n.get("symbol")}
            for n in nfts
        ],
    }

    with open(path, "w") as f:
        json.dump(snap, f, indent=2, ensure_ascii=False)
    return snap
