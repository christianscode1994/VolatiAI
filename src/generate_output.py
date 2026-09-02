import json
from datetime import datetime
from .compute_sentiment import sentiment_label

def build_payload(
    coins_vol,
    sentiment_reddit,
    sentiment_hn,
    tier: str,
    kraken_data=None,
    binance_data=None,
    coinbase_data=None,
    crypto_com_data=None,
    bybit_data=None,
    okx_data=None,
    whales=None,
    spoofing=None,
    liquidity=None,
    arbitrage=None,
    depth_heatmaps=None,
):

    now = datetime.utcnow().isoformat() + "Z"

    payload = {
        "timestamp": now,
        "tier": tier,
        "top_by_volatility": coins_vol,
        "sentiment": {
            "reddit": {
                "score": sentiment_reddit["score"],
                "avg": sentiment_reddit["avg"],
                "count": sentiment_reddit["count"],
                "label": sentiment_label(sentiment_reddit["avg"]),
            },
            "hn": {
                "score": sentiment_hn["score"],
                "avg": sentiment_hn["avg"],
                "count": sentiment_hn["count"],
                "label": sentiment_label(sentiment_hn["avg"]),
            },
        },
        "exchanges": {
            "kraken": kraken_data,
            "binance": binance_data,
            "coinbase": coinbase_data,
            "crypto_com": crypto_com_data,
            "bybit": bybit_data,
            "okx": okx_data,
        },
        "whales": whales,
        "spoofing": spoofing,
        "liquidity": liquidity,
        "arbitrage": arbitrage,
        "depth_heatmaps": depth_heatmaps,
    }

    return payload



def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def write_html(path, payload):
    ts = payload["timestamp"]
    tier = payload["tier"]
    coins = payload["top_by_volatility"]
    sent = payload["sentiment"]
    exchanges = payload["exchanges"]

    whales = payload.get("whales")
    spoofing = payload.get("spoofing")
    liquidity = payload.get("liquidity")
    arbitrage = payload.get("arbitrage")
    depth_heatmaps = payload.get("depth_heatmaps")

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>VolatiAI – {tier} dashboard</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background:#0b0c10; color:#c5c6c7; }}
    h1 {{ color:#66fcf1; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: 1rem; }}
    th, td {{ border: 1px solid #1f2833; padding: 0.4rem; text-align: left; }}
    th {{ background:#1f2833; }}
    .label {{ font-weight:bold; }}
  </style>
</head>
<body>
  <h1>VolatiAI – {tier} dashboard</h1>
  <p>Updated: {ts}</p>

  <h2>Sentiment</h2>
  <p><span class="label">Reddit:</span> {sent['reddit']['label']} (avg {sent['reddit']['avg']:.2f}, n={sent['reddit']['count']})</p>
  <p><span class="label">Hacker News:</span> {sent['hn']['label']} (avg {sent['hn']['avg']:.2f}, n={sent['hn']['count']})</p>
"""

    # Pro Features Section
    if tier == "pro":
        html += """
  <h2>Pro Features</h2>
  <ul>
    <li>Whale Intelligence</li>
    <li>Spoofing Detection</li>
    <li>Liquidity Migration</li>
    <li>Arbitrage Deltas</li>
    <li>Depth Heatmaps</li>
    <li>Multi-exchange market data</li>
  </ul>
"""

    # Whale Intelligence
    if whales:
        html += f"""
  <h2>Whale Intelligence (Pro)</h2>
  <p><span class="label">Whale Pressure Index:</span> {whales.get('whale_pressure_index')}</p>
  <p><span class="label">Aggregate Imbalance:</span> {whales.get('aggregate_imbalance')}</p>
"""

    # Spoofing Signals
    if spoofing:
        html += "<h2>Spoofing Signals (Pro)</h2>"
        for ex, signals in spoofing.items():
            html += f"<p>{ex}: {len(signals)} spoofing candidates</p>"

    # Liquidity Distribution
    if liquidity:
        html += "<h2>Liquidity Distribution (Pro)</h2>"
        for ex, share in liquidity.get("liquidity_shares", {}).items():
            html += f"<p>{ex}: {share:.2%} of total liquidity</p>"

    # Arbitrage Deltas
    if arbitrage:
        html += "<h2>Arbitrage Deltas (Pro)</h2>"
        base = arbitrage.get("base_exchange")
        html += f"<p>Base exchange: {base}</p>"
        for ex, delta in arbitrage.get("deltas_vs_base", {}).items():
            html += f"<p>{ex}: {delta:.3%} vs base</p>"

    # Depth Heatmaps
    if depth_heatmaps:
        html += "<h2>Depth Heatmaps (Pro)</h2>"
        for ex, buckets in depth_heatmaps.items():
            html += f"<h3>{ex}</h3>"
            for b in buckets[:10]:
                html += f"<p>{b['side']} @ {b['bucket_price']}: {b['notional']:.2f}</p>"

    # Exchange sections
    for name, data in exchanges.items():
        if data:
            html += f"""
  <h2>{name.capitalize()} (Pro)</h2>
  <p><span class="label">Ticker:</span> {data.get('ticker')}</p>
  <p><span class="label">Depth:</span> {data.get('depth')}</p>
"""

    # Volatility table
    html += """
  <h2>Top by volatility</h2>
  <table>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Symbol</th>
      <th>Price (USD)</th>
      <th>Volatility</th>
      <th>1h %</th>
      <th>24h %</th>
      <th>7d %</th>
      <th>Market Cap</th>
    </tr>
"""
    for i, c in enumerate(coins, start=1):
        html += f"""    <tr>
      <td>{i}</td>
      <td>{c['name']}</td>
      <td>{c['symbol']}</td>
      <td>{c['current_price']}</td>
      <td>{c['volatility']:.3f}</td>
      <td>{c.get('price_change_1h')}</td>
      <td>{c.get('price_change_24h')}</td>
      <td>{c.get('price_change_7d')}</td>
      <td>{c['market_cap']}</td>
    </tr>
"""

    html += """
  </table>
</body>
</html>
"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
