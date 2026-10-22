#!/usr/bin/env python3
"""volatiai today — format briefing.json for the terminal.

Fetches the public endpoint (or a local file) and renders a
human-readable summary. Stdlib only, no dependencies.

Usage:
    python3 scripts/today.py                      # live endpoint
    python3 scripts/today.py --local docs/briefing.json
    python3 scripts/today.py --json               # raw output
"""
import argparse
import json
import sys
import urllib.request

DEFAULT_URL = "https://christianscode1994.github.io/VolatiAI/briefing.json"
UA = "VolatiAI-CLI/1.0"


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"user-agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def load_local(path):
    with open(path) as f:
        return json.load(f)


def fmt_pct(v):
    return "—" if v is None else f"{v:+.1f}%"


def render(briefing):
    lines = []
    ts = briefing.get("ts", "?")
    run = briefing.get("run_number", "?")
    signals = briefing.get("signals", [])
    delta = briefing.get("delta") or {}
    stats = briefing.get("stats") or {}
    watchlist = briefing.get("watchlist") or []
    headline = (briefing.get("briefing") or {}).get("headline", "")

    bar = "═" * 60
    lines.append(bar)
    lines.append(f"  VolatiAI — {ts}  (run {run})")
    lines.append(bar)
    if headline:
        lines.append(f"  {headline}")
    lines.append("")

    new = delta.get("new") or []
    dropped = delta.get("dropped") or []
    persistent = delta.get("persistent") or []
    prev_ts = delta.get("previous_ts", "?")

    if new or dropped:
        lines.append(f"  CHANGES SINCE {prev_ts}:")
        for s in new:
            lines.append(f"    + {s}")
        for s in dropped:
            lines.append(f"    - {s}")
        lines.append("")

    if signals:
        lines.append("  SIGNALS:")
        for sig in signals:
            sector = sig.get("sector", "?")
            summary = sig.get("summary", "")
            conf = sig.get("confidence")
            pct = sig.get("pct_change")
            fires = sig.get("fires_24")
            meta = []
            if conf is not None:
                meta.append(f"conf={conf:.2f}")
            if pct is not None:
                meta.append(fmt_pct(pct))
            if fires:
                meta.append(f"fires_24={fires}")
            meta_str = f"  ({', '.join(meta)})" if meta else ""
            lines.append(f"    • {sector}{meta_str}")
            if summary and summary != "quiet":
                lines.append(f"        {summary}")
        lines.append("")

    if watchlist:
        lines.append("  WATCHLIST (high volatility, no signal):")
        for w in watchlist[:5]:
            sector = w.get("sector", "?")
            vol = w.get("avg_volatility")
            fires = w.get("fires_in_window", 0)
            vol_str = f"{vol:.2f}" if vol is not None else "—"
            lines.append(f"    {sector:<20} vol {vol_str:>8}    fires: {fires}")
        lines.append("")

    before = delta.get("signals_before", 0)
    after = delta.get("signals_after", 0)
    lines.append(f"  DELTA:  {before} → {after}  ({len(new)} new, {len(dropped)} dropped, {len(persistent)} persistent)")

    if stats:
        total = stats.get("total_sectors", 0)
        firing = stats.get("firing_sectors", 0)
        rate = stats.get("fire_rate_pct", 0)
        runs = stats.get("runs_in_history", 0)
        lines.append(f"  STATS:  {total} sectors · {firing} firing · {rate}% · {runs} runs")

    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description="Format VolatiAI briefing.json for terminal")
    p.add_argument("--url", default=DEFAULT_URL, help="briefing.json URL")
    p.add_argument("--local", help="read from local file instead of URL")
    p.add_argument("--json", action="store_true", help="output raw JSON instead of formatted")
    args = p.parse_args()

    try:
        data = load_local(args.local) if args.local else fetch(args.url)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data, indent=2))
        return 0

    print(render(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
