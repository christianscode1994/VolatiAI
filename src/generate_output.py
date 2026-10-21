from src.narrative_section import build_narrative_sections, build_live_signals_section
import json
from datetime import datetime

from .compute_sentiment import sentiment_label


def build_payload(
    coins_vol,
    sentiment_hn,
    exchanges=None,
    whales=None,
    spoofing=None,
    liquidity=None,
    arbitrage=None,
    depth_heatmaps=None,
    dev_activity=None,
    nft_activity=None,
):
    now = datetime.utcnow().isoformat() + "Z"

    hn_block = sentiment_hn.get("hn", {})
    combined = sentiment_hn.get("combined", hn_block)

    payload = {
        "timestamp": now,
        "top_by_volatility": coins_vol,
        "sentiment": {
            "hn": {
                "score": hn_block.get("score", 0.0),
                "avg": hn_block.get("avg", 0.0),
                "count": hn_block.get("count", 0),
                "label": sentiment_label(hn_block.get("avg", 0.0)),
            },
            "combined": {
                "score": combined.get("score", 0.0),
                "avg": combined.get("avg", 0.0),
                "count": combined.get("count", 0),
                "label": sentiment_label(combined.get("avg", 0.0)),
            },
        },
        "exchanges": exchanges or {},
        "whales": whales,
        "spoofing": spoofing,
        "liquidity": liquidity,
        "arbitrage": arbitrage,
        "depth_heatmaps": depth_heatmaps,
        "dev_activity": dev_activity,
        "nft_activity": nft_activity,
    }

    return payload


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def write_html(path, payload, score=None):
    ts = payload["timestamp"]
    coins = payload["top_by_volatility"]
    sent = payload.get("sentiment", {})
    exchanges = payload.get("exchanges", {}) or {}

    whales = payload.get("whales")
    spoofing = payload.get("spoofing")
    liquidity = payload.get("liquidity")
    arbitrage = payload.get("arbitrage")
    depth_heatmaps = payload.get("depth_heatmaps")

    hn = sent.get("hn", {})
    hn_label = hn.get("label", "n/a")
    hn_avg = hn.get("avg", 0.0)
    hn_count = hn.get("count", 0)

    def fmt_usd(v):
        try:
            v = float(v)
            if v >= 1e9: return f"${v/1e9:.2f}B"
            if v >= 1e6: return f"${v/1e6:.2f}M"
            if v >= 1e3: return f"${v:,.0f}"
            return f"${v:,.2f}"
        except Exception:
            return "—"

    def fmt_pct(v):
        try:
            return f"{float(v):+.2f}%"
        except Exception:
            return "—"

    def fmt_price(v):
        try:
            return f"${float(v):,.2f}"
        except Exception:
            return "—"

    def extract_last(ticker):
        if not isinstance(ticker, dict):
            return None
        c = ticker.get("c")
        if isinstance(c, list) and c:
            try: return float(c[0])
            except Exception: pass
        for key in ("last", "lastPrice"):
            v = ticker.get(key)
            if v:
                try: return float(v)
                except Exception: pass
        return None

    def extract_bid_ask(ticker):
        if not isinstance(ticker, dict):
            return None, None
        b = ticker.get("b")
        a = ticker.get("a")
        if isinstance(b, list) and b and isinstance(a, list) and a:
            try: return float(b[0]), float(a[0])
            except Exception: pass
        try:
            bid = float(ticker.get("bidPx") or ticker.get("bid1Price"))
            ask = float(ticker.get("askPx") or ticker.get("ask1Price"))
            return bid, ask
        except Exception:
            return None, None

    def extract_24h(ticker):
        if not isinstance(ticker, dict):
            return None
        p = ticker.get("price24hPcnt")
        if p is not None:
            try: return float(p) * 100
            except Exception: pass
        # Kraken: 'c' (last trade) vs 'o' (opening)
        try:
            c = ticker.get("c")
            o = ticker.get("o")
            if isinstance(c, list) and c and o is not None:
                last = float(c[0]); op = float(o)
                return (last - op) / op * 100
        except Exception:
            pass
        # OKX: last vs open24h
        try:
            c = ticker.get("c")
            o = ticker.get("o")
            if isinstance(c, list) and c and o is not None:
                last = float(c[0]); op = float(o)
                return (last - op) / op * 100
        except Exception:
            pass
        try:
            last = float(ticker.get("last") or ticker.get("lastPrice"))
            op = float(ticker.get("open24h"))
            return (last - op) / op * 100
        except Exception:
            return None

    score_str = "—"
    score_class = "score-neutral"
    if score is not None:
        score_str = f"{score:+.4f}"
        if score > 0.3:
            score_class = "score-bull"
        elif score < -0.3:
            score_class = "score-bear"

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>VolatiAI Dashboard</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ font-family: system-ui, -apple-system, sans-serif; background: #0b0c10; color: #c5c6c7; margin: 0; padding: 2rem; }}
    h1 {{ color: #66fcf1; margin: 0 0 0.5rem 0; font-size: 2rem; }}
    h2 {{ color: #66fcf1; margin: 2rem 0 1rem 0; font-size: 1.2rem; border-bottom: 1px solid #1f2833; padding-bottom: 0.5rem; }}
    .updated {{ color: #7a7a7a; font-size: 0.9rem; margin-bottom: 1.5rem; }}
    .score-card {{ display: inline-block; padding: 1.5rem 2rem; border-radius: 8px; margin: 1rem 0; background: #1f2833; }}
    .score-card .label {{ font-size: 0.8rem; color: #7a7a7a; text-transform: uppercase; letter-spacing: 0.1em; }}
    .score-card .value {{ font-size: 2.5rem; font-weight: 700; margin-top: 0.25rem; }}
    .score-bull {{ color: #4ade80; }}
    .score-bear {{ color: #f87171; }}
    .score-neutral {{ color: #fbbf24; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin: 1rem 0; }}
    .card {{ background: #1f2833; padding: 1rem 1.25rem; border-radius: 8px; border-left: 3px solid #45a29e; }}
    .card .label {{ color: #7a7a7a; font-size: 0.85rem; }}
    .card .value {{ color: #66fcf1; font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }}
    .card .sub {{ color: #a0a0a0; font-size: 0.85rem; margin-top: 0.25rem; }}
    .pill {{ display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; }}
    .pill-bull {{ background: rgba(74,222,128,0.15); color: #4ade80; }}
    .pill-bear {{ background: rgba(248,113,113,0.15); color: #f87171; }}
    .pill-neutral {{ background: rgba(251,191,36,0.15); color: #fbbf24; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: 1rem; }}
    th, td {{ border: 1px solid #1f2833; padding: 0.5rem 0.6rem; text-align: right; font-size: 0.9rem; }}
    th {{ background: #1f2833; color: #66fcf1; text-align: right; font-weight: 600; }}
    td:first-child, th:first-child {{ text-align: center; }}
    td:nth-child(2), th:nth-child(2) {{ text-align: left; }}
    tr:hover {{ background: rgba(102,252,241,0.05); }}
    .pos {{ color: #4ade80; }}
    .neg {{ color: #f87171; }}
    .empty {{ color: #7a7a7a; font-style: italic; padding: 0.5rem 0; }}
  </style>
</head>
<body>
  <h1>VolatiAI Intelligence</h1>
  <div class="updated">Updated: {ts}</div>

  <div class="score-card">
    <div class="label">Composite Score</div>
    <div class="value {score_class}">{score_str}</div>
  </div>
"""

    hn_class = "pill-neutral"
    if hn_avg > 0.3: hn_class = "pill-bull"
    elif hn_avg < -0.3: hn_class = "pill-bear"
    html += f"""
  <h2>Sentiment</h2>
  <div class="card">
    <div class="label">Hacker News</div>
    <div class="value"><span class="pill {hn_class}">{hn_label}</span></div>
    <div class="sub">avg {hn_avg:+.3f} across {hn_count} titles</div>
  </div>
"""

    html += build_live_signals_section() + build_narrative_sections() + '\n  <h2>Market Microstructure</h2>\n  <div class="grid">\n'

    if whales:
        wp = whales.get("whale_pressure_index")
        ai = whales.get("aggregate_imbalance")
        wp_class = "score-neutral"
        if wp is not None:
            if wp > 60: wp_class = "score-bull"
            elif wp < 40: wp_class = "score-bear"
        html += f"""
    <div class="card">
      <div class="label">Whale Pressure Index</div>
      <div class="value {wp_class}">{wp}</div>
      <div class="sub">imbalance {ai if ai is not None else "—"}</div>
    </div>
"""

    if liquidity:
        shares = liquidity.get("liquidity_shares", {})
        html += f"""
    <div class="card">
      <div class="label">Liquidity Distribution</div>
      <div class="value">{len([s for s in shares.values() if s])} exchanges</div>
      <div class="sub">{" · ".join(f"{k} {v:.0%}" for k, v in shares.items() if v)}</div>
    </div>
"""

    if arbitrage:
        base = arbitrage.get("base_exchange")
        deltas = arbitrage.get("deltas_vs_base", {})
        max_delta = max((abs(v) for v in deltas.values() if v is not None), default=0)
        html += f"""
    <div class="card">
      <div class="label">Arbitrage (base: {base})</div>
      <div class="value">{max_delta:.3%}</div>
      <div class="sub">max delta across {len(deltas)} exchanges</div>
    </div>
"""
    html += '  </div>\n'

    if spoofing:
        count = spoofing.get("signal_count", 0)
        if count == 0:
            html += """
  <h2>Spoofing Detection</h2>
  <div class="card">
    <div class="label">Status</div>
    <div class="value"><span class="pill pill-bull">Clean</span></div>
    <div class="sub">no spoofing signals detected across all exchanges</div>
  </div>
"""
        else:
            html += f"""
  <h2>Spoofing Detection</h2>
  <div class="card">
    <div class="label">Signals Detected</div>
    <div class="value"><span class="pill pill-bear">{count}</span></div>
    <div class="sub">largest notional {spoofing.get("largest_notional", "—")}</div>
  </div>
"""

    if depth_heatmaps:
        html += '  <h2>Depth Heatmaps</h2>\n  <div class="grid">\n'
        for ex, buckets in depth_heatmaps.items():
            html += f'    <div class="card"><div class="label">{ex.capitalize()}</div>\n'
            html += '    <div class="sub" style="margin-top:0.5rem">\n'
            for b in buckets[:5]:
                side = b.get("side", "?")
                price = b.get("bucket_price", 0)
                notional = b.get("notional", 0)
                cls = "pos" if side == "bid" else "neg"
                html += f'      <div><span class="{cls}">{side.upper()}</span> ${price:,.0f} → {fmt_usd(notional)}</div>\n'
            html += '    </div></div>\n'
        html += '  </div>\n'

    if exchanges:
        html += '  <h2>Exchanges</h2>\n  <div class="grid">\n'
        for name, data in exchanges.items():
            if not data:
                html += f'    <div class="card"><div class="label">{name.capitalize()}</div><div class="empty">unavailable</div></div>\n'
                continue
            ticker = data.get("ticker")
            last = extract_last(ticker)
            bid, ask = extract_bid_ask(ticker)
            chg24 = extract_24h(ticker)
            spread_txt = "—"
            if bid and ask and ask > 0:
                spread = ask - bid
                spread_pct = (spread / ask) * 100
                spread_txt = f"${spread:,.2f} ({spread_pct:.4f}%)"
            chg_cls = ""
            chg_txt = "—"
            if chg24 is not None:
                chg_txt = fmt_pct(chg24)
                chg_cls = "pos" if chg24 >= 0 else "neg"
            html += f"""
    <div class="card">
      <div class="label">{name.capitalize()} · BTC/USD</div>
      <div class="value">{fmt_price(last)}</div>
      <div class="sub">spread {spread_txt}</div>
      <div class="sub">24h <span class="{chg_cls}">{chg_txt}</span></div>
    </div>
"""
        html += '  </div>\n'

    html += """
  <h2>Top by Volatility</h2>
  <table>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Symbol</th>
      <th>Price</th>
      <th>Volatility</th>
      <th>1h</th>
      <th>24h</th>
      <th>7d</th>
      <th>Market Cap</th>
    </tr>
"""
    for i, c in enumerate(coins, start=1):
        vol = c.get("volatility", 0.0)
        ch1 = c.get("price_change_1h")
        ch24 = c.get("price_change_24h")
        ch7 = c.get("price_change_7d")
        def cls(v):
            try:
                return "pos" if float(v) >= 0 else "neg"
            except Exception:
                return ""
        html += f"""    <tr>
      <td>{i}</td>
      <td>{c.get('name', '')}</td>
      <td>{c.get('symbol', '').upper()}</td>
      <td>{fmt_price(c.get('current_price'))}</td>
      <td>{vol:.3f}</td>
      <td class="{cls(ch1)}">{fmt_pct(ch1)}</td>
      <td class="{cls(ch24)}">{fmt_pct(ch24)}</td>
      <td class="{cls(ch7)}">{fmt_pct(ch7)}</td>
      <td>{fmt_usd(c.get('market_cap'))}</td>
    </tr>
"""

    html += """
  </table>
</body>
</html>
"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
