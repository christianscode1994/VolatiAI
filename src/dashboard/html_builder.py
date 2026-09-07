import json
from pathlib import Path
from .components import card, grid
from .themes import FREE_THEME, PRO_THEME

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
      <title>VolatiAI – Free Dashboard</title>
      <style>{FREE_THEME}</style>
    </head>
    <body>
      <h1>VolatiAI – Free Tier</h1>

      {card("Volatility", scores.get("volatility_score", "–"))}
      {card("Sentiment", scores.get("sentiment_score", "–"))}
      {card("Developer Sentiment Index", scores.get("developer_sentiment_index", "–"))}

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
    </body>
    </html>
    """

    Path("private/pro.html").write_text(html)
    Path("docs/summary_pro.html").write_text(html)

if __name__ == "__main__":
    render_free()
    render_pro()
