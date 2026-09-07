import json

def volatility_svg():
    history = json.loads(open("private/trends_history.json").read())
    points = [h["volatility"] for h in history[-30:]]
    if not points:
        return ""

    max_v = max(points) or 1
    path = " ".join(f"L {i*10} {100 - (p/max_v)*100}" for i, p in enumerate(points))
    return f'<svg width="320" height="120"><path d="M 0 100 {path}" stroke="#22c55e" fill="none"/></svg>'
