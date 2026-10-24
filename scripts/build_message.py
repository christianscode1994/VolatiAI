#!/usr/bin/env python3
"""Read /latest JSON from stdin, print a short bot message."""
import json, sys

try:
    d = json.load(sys.stdin)
except Exception:
    print("VolatiAI · pipeline unreachable")
    sys.exit(0)

signals = [r for r in d.get("rows", []) if r.get("has_signal")]
total = d.get("with_history", 0)

if not signals:
    print(f"VolatiAI · {total} sectors active · all quiet")
else:
    lines = [f"VolatiAI · {len(signals)} signal(s)"]
    for r in signals[:5]:
        pct = r.get("pct_change") or 0
        lines.append(f"{r['sector']}: {r['current']} ({pct:+.1f}%)")
    print("\n".join(lines))
