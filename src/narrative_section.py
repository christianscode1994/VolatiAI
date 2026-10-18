"""Keyless narrative + sentiment sections for the VolatiAI dashboard.
No secrets, no KV, no state. Called once per HTML generation."""

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
