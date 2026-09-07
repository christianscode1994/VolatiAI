import json
from pathlib import Path
from .components import card, grid
from .themes import FREE_THEME, PRO_THEME
from .charts import (
    volatility_svg,
    depth_svg,
    trend_accel_svg,
    narrative_timeline_svg,
    whale_pressure_svg,
    spoofing_svg,
    rpc_truth_svg,
)


def load(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def render_free():
    data = load("public/free.json")
    scores = data.get("scores", {})

    html = f"""
<html>
<head>
  <title>VolatiAI – Pro Dashboard</title>
  <style>{PRO_THEME}</style>
</head>
<body>
  <h1>VolatiAI – Pro Tier</h1>

  {grid(cards)}

  <h2>Volatility (30‑day)</h2>
  {volatility_svg()}

  <h2>Depth Heatmap</h2>
  {depth_svg()}

  <h2>Trend Acceleration</h2>
  {trend_accel_svg()}

  <h2>AI / DePIN Narrative Timeline</h2>
  {narrative_timeline_svg()}

  <h2>Whale Pressure</h2>
  {whale_pressure_svg()}

  <h2>Spoofing Probability</h2>
  {spoofing_svg()}

  <h2>Multi‑Chain RPC Truth</h2>
  {rpc_truth_svg()}

</body>
</html>
"""


    Path("public/free.html").write_text(html)
    Path("docs/summary_free.html").write_text(html)

def render_pro():
    data = load("private/pro.json")
    scores = data.get("scores", {})

    cards = "".join([
        card("Trend Index", scores.get("trend_index", "–")),
        card("Liquidity Index", scores.get("liquidity_index", "–")),
        card("AI/DePIN Narrative Index", scores.get("narrative_index", "–")),
        card("Developer Sentiment Index", scores.get("developer_sentiment_index", "–"))
    ])

    html = f"""
<html>
<head>
  <title>VolatiAI – Pro Dashboard</title>
  <style>{PRO_THEME}</style>
</head>
<body>
  <h1>VolatiAI – Pro Tier</h1>

  {grid(cards)}

  <h2>Volatility (30‑day)</h2>
  {volatility_svg()}

  <h2>Depth Heatmap</h2>
  {depth_svg()}

</body>
</html>
"""



    Path("private/pro.html").write_text(html)
    Path("docs/summary_pro.html").write_text(html)

if __name__ == "__main__":
    render_free()
    render_pro()
