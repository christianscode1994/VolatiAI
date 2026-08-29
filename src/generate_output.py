import json
from datetime import datetime
from .compute_sentiment import sentiment_label

def build_payload(coins_vol, sentiment_reddit, sentiment_hn, tier: str, kraken_data=None):
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
    }
    if kraken_data is not None:
        payload["kraken"] = kraken_data
    return payload

def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

def write_html(path, payload):
    ts = payload["timestamp"]
    tier = payload["tier"]
    coins = payload["top_by_volatility"]
    sent = payload["sentiment"]
    kraken = payload.get("kraken")

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

    if kraken:
        html += f"""
  <h2>Kraken (Pro)</h2>
  <p><span class="label">Pair:</span> {kraken.get('pair', 'XXBTZUSD')}</p>
  <p><span class="label">Last price:</span> {kraken['ticker']['c'][0]}</p>
  <p><span class="label">24h high:</span> {kraken['ticker']['h'][1]} | <span class="label">24h low:</span> {kraken['ticker']['l'][1]}</p>
  <p><span class="label">Orderbook depth:</span> {len(kraken['depth'].get('asks', []))} asks / {len(kraken['depth'].get('bids', []))} bids</p>
"""

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
