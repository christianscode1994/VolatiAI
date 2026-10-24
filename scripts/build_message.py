#!/usr/bin/env python3
"""Read /latest JSON from stdin, print short bot message with dashboard link."""
import json, sys

URL = "https://christianscode1994.github.io/VolatiAI/d.html"
MAX_SIGNALS = 3

try:
    d = json.load(sys.stdin)
except Exception:
    print(f"VolatiAI · pipeline unreachable\n→ {URL}")
    sys.exit(0)

signals = [r for r in d.get("rows", []) if r.get("has_signal")]
total = d.get("with_history", 0)

if not signals:
    print(f"VolatiAI · {total} sectors active · all quiet\n→ {URL}")
else:
    signals.sort(key=lambda r: abs(r.get("pct_change") or 0), reverse=True)
    lines = [f"VolatiAI · {len(signals)} signal(s)"]
    for r in signals[:MAX_SIGNALS]:
        pct = r.get("pct_change") or 0
        cur = r.get("current", 0)
        if isinstance(cur, (int, float)):
            cur_s = f"{cur:,.2f}" if abs(cur) >= 1 else f"{cur:.4g}"
        else:
            cur_s = str(cur)
        lines.append(f"{r['sector']}: {cur_s} ({pct:+.1f}%)")
    if len(signals) > MAX_SIGNALS:
        lines.append(f"... +{len(signals)-MAX_SIGNALS} more")
    lines.append(f"→ {URL}")
    print("\n".join(lines))
