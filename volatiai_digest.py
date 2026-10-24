#!/usr/bin/env python3
"""volatiai_digest.py — daily summary pushed to ntfy. Reads /latest (1 HTTP call)."""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone

TOPIC = os.environ.get("VOLATIAI_NTFY_TOPIC", "").strip()
BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
UA = "VolatiAI/1.0 (digest)"

def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={"user-agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20","-A",UA,url],
                             capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

def ntfy(title, body):
    if not TOPIC:
        print(f"[no topic] {title}\n{body}"); return
    req = urllib.request.Request(f"https://ntfy.sh/{TOPIC}",
        data=body.encode(), headers={"Title": title, "Tags": "chart_with_upwards_trend"},
        method="POST")
    with urllib.request.urlopen(req, timeout=10) as r: r.read()

def main():
    data = fetch_json(f"{BASE}/latest")
    if not data or "rows" not in data:
        sys.exit("/latest unavailable")
    rows = data["rows"]
    live = [r for r in rows if r.get("pts", 0) >= 2]
    movers = sorted(live, key=lambda r: abs(r.get("pct_change") or 0), reverse=True)[:10]

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"VolatiAI daily · {ts}", ""]
    lines.append(f"{data.get('count',0)} sectors · {len(live)} with history")
    lines.append("")
    if not movers:
        lines.append("No movement — all quiet.")
    else:
        lines.append("Top movers:")
        for r in movers:
            pct = r.get("pct_change") or 0
            arrow = "▼" if pct < 0 else "▲"
            lines.append(f"  {r['sector']:<28} {pct:+6.2f}% {arrow}")

    body = "\n".join(lines)
    ntfy(f"VolatiAI {ts}", body)
    print(f"sent digest ({len(live)} live, {len(movers)} movers)")

if __name__ == "__main__":
    main()
