#!/usr/bin/env python3
"""Compare current briefing to previous run.

Shows: persistent signals, new signals, dropped signals,
and direction of movement for persistent sectors.
"""

import json
from pathlib import Path


def load_history(path="data/digest_history.json"):
    with open(path) as f:
        return json.load(f)


def delta(history):
    runs = history.get("runs", [])
    if len(runs) < 2:
        return None

    current = runs[-1]
    previous = runs[-2]

    cur_fired = {name: data for name, data in current.get("sectors", {}).items()
                 if data.get("has_signal")}
    prev_fired = {name: data for name, data in previous.get("sectors", {}).items()
                  if data.get("has_signal")}

    cur_names = set(cur_fired.keys())
    prev_names = set(prev_fired.keys())

    persistent = sorted(cur_names & prev_names)
    new_signals = sorted(cur_names - prev_names)
    dropped = sorted(prev_names - cur_names)

    # Movement in persistent signals
    movements = []
    for name in persistent:
        cur_summary = cur_fired[name].get("summary", "")
        prev_summary = prev_fired[name].get("summary", "")
        if cur_summary and prev_summary and cur_summary != prev_summary:
            movements.append({
                "sector": name,
                "previous": prev_summary[:80],
                "current": cur_summary[:80],
            })

    return {
        "current_ts": (current.get("timestamp") or "")[:16].replace("T", " "),
        "previous_ts": (previous.get("timestamp") or "")[:16].replace("T", " "),
        "current_count": len(cur_fired),
        "previous_count": len(prev_fired),
        "persistent": persistent,
        "new_signals": new_signals,
        "dropped": dropped,
        "movements": movements,
    }


def format_html(d):
    if not d:
        return ""

    html = f'''
  <div class="card" style="border-left-color: #45a29e; margin-bottom: 1.5rem;">
    <div class="label">Since {d["previous_ts"]}Z</div>
    <div style="font-size: 1.1rem; color: #66fcf1; margin: 0.5rem 0;">
      {d["previous_count"]} → {d["current_count"]} signals
    </div>
'''

    if d["new_signals"]:
        html += f'    <div style="margin: 0.4rem 0;"><span class="pill pill-bull">NEW</span> {", ".join(d["new_signals"])}</div>\n'
    if d["dropped"]:
        html += f'    <div style="margin: 0.4rem 0;"><span class="pill pill-bear">DROPPED</span> {", ".join(d["dropped"])}</div>\n'
    if d["persistent"]:
        html += f'    <div style="margin: 0.4rem 0; color: #a0a0a0;"><strong>Persistent ({len(d["persistent"])})</strong>: {", ".join(d["persistent"])}</div>\n'

    if d["movements"]:
        html += '    <div style="margin-top: 0.8rem;"><strong>Movement in persistent signals</strong></div>\n'
        html += '    <table style="margin-top: 0.4rem; font-size: 0.85rem;">\n'
        html += '      <tr><th>Sector</th><th>Previous</th><th>Current</th></tr>\n'
        for m in d["movements"]:
            html += (f'      <tr><td>{m["sector"]}</td>'
                    f'<td>{m["previous"]}</td>'
                    f'<td>{m["current"]}</td></tr>\n')
        html += '    </table>\n'

    html += '''  </div>
'''
    return html


if __name__ == "__main__":
    import sys
    history = load_history()
    d = delta(history)
    if not d:
        print("Need at least 2 runs")
        sys.exit(0)
    print(f"=== Since {d['previous_ts']}Z ===")
    print(f"{d['previous_count']} → {d['current_count']} signals")
    print()
    if d["new_signals"]:
        print(f"NEW: {', '.join(d['new_signals'])}")
    if d["dropped"]:
        print(f"DROPPED: {', '.join(d['dropped'])}")
    if d["persistent"]:
        print(f"Persistent: {', '.join(d['persistent'])}")
    print()
    if d["movements"]:
        print("Movement in persistent signals:")
        for m in d["movements"]:
            print(f"  {m['sector']}")
            print(f"    was: {m['previous']}")
            print(f"    now: {m['current']}")
