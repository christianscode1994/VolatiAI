#!/usr/bin/env python3
"""build_message.py — signal-aware message with cluster dedup."""
import json, os, sys, subprocess
from pathlib import Path

URL = "https://christianscode1994.github.io/VolatiAI/d.html"
BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")

def fetch_json(url):
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","10",url], capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

try:
    d = json.load(sys.stdin)
except Exception:
    print(f"VolatiAI · pipeline unreachable\n→ {URL}")
    sys.exit(0)

signals = [r for r in d.get("rows", []) if r.get("has_signal")]
total = d.get("with_history", 0)

# Load cluster graph if available
try:
    graph = json.loads(Path("config/graph.json").read_text())
    s2c = graph.get("sector_to_cluster", {})
except Exception:
    s2c = {}

if not signals:
    print(f"VolatiAI · {total} sectors active · all quiet\n→ {URL}")
    sys.exit(0)

# Group signals by cluster
by_cluster = {}
singles = []
for r in signals:
    cid = s2c.get(r["sector"])
    if cid: by_cluster.setdefault(cid, []).append(r)
    else: singles.append(r)

lines = [f"VolatiAI · {len(signals)} signal(s)"]

# Cluster summaries first
for cid, members in sorted(by_cluster.items(), key=lambda kv: -len(kv[1])):
    moves = [m.get("pct_change", 0) or 0 for m in members]
    avg = sum(moves) / len(moves)
    direction = "▼" if avg < 0 else "▲"
    lines.append(f"{cid} ×{len(members)}: {avg:+.1f}% {direction}")

# Then top individual singles
for r in sorted(singles, key=lambda x: abs(x.get("pct_change", 0) or 0), reverse=True)[:2]:
    pct = r.get("pct_change") or 0
    cur = r.get("current", 0)
    cur_s = f"{cur:,.2f}" if isinstance(cur, (int, float)) and abs(cur) >= 1 else f"{cur:.4g}" if isinstance(cur, (int, float)) else str(cur)
    lines.append(f"{r['sector']}: {cur_s} ({pct:+.1f}%)")

if len(signals) > len(by_cluster) + 2:
    extra = len(signals) - len(by_cluster) - 2
    if extra > 0:
        lines.append(f"... +{extra} more")

lines.append(f"→ {URL}")
print("\n".join(lines))
