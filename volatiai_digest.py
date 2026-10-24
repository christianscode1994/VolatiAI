#!/usr/bin/env python3
"""volatiai_digest.py — daily summary pushed to ntfy. Reads /latest (1 HTTP call)."""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone

TOPIC = os.environ.get("VOLATIAI_NTFY_TOPIC", "").strip()
BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
UA = "VolatiAI/1.0 (digest)"

def http_get(url):
    try:
        req = urllib.request.Request(url, headers={"user-agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20","-A",UA,url],
                             capture_output=True)
        return out.stdout if out.returncode == 0 else None

def http_post(url, data, headers):
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read()
    except Exception:
        cmd = ["curl", "-sfL", "--max-time", "10", "-X", "POST", "--data-binary", "@-"]
        for k, v in headers.items():
            cmd += ["-H", f"{k}: {v}"]
        cmd.append(url)
        out = subprocess.run(cmd, input=data, capture_output=True)
        return out.stdout if out.returncode == 0 else None

def ntfy(title, body):
    if not TOPIC:
        print(f"[no topic] {title}\n{body}"); return
    http_post(f"https://ntfy.sh/{TOPIC}", body.encode("utf-8"),
              {"Title": title, "Tags": "chart_with_upwards_trend"})

def main():
    raw = http_get(f"{BASE}/latest")
    if raw is None:
        sys.exit("/latest unreachable")
    try:
        data = json.loads(raw)
    except Exception as e:
        sys.exit(f"/latest bad JSON: {e}")
    if "rows" not in data:
        sys.exit("/latest wrong shape")

    rows = data["rows"]
    live = [r for r in rows if r.get("pts", 0) >= 2]
    movers = sorted(live, key=lambda r: abs(r.get("pct_change") or 0), reverse=True)[:10]

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"{data.get('count',0)} sectors · {len(live)} with history", ""]
    if not movers:
        lines.append("No movement — all quiet.")
    else:
        lines.append("Top movers:")
        for r in movers:
            pct = r.get("pct_change") or 0
            arrow = "v" if pct < 0 else "^"
            lines.append(f"  {r['sector']:<28} {pct:+6.2f}% {arrow}")

    body = "\n".join(lines)
    ntfy(f"VolatiAI {ts}", body)
    print(f"sent digest ({len(live)} live, {len(movers)} movers)")

if __name__ == "__main__":
    main()
