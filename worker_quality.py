#!/usr/bin/env python3
"""Score each worker by signal frequency + quality over history."""
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HISTORY = ROOT / "reports" / "signal_history.jsonl"
SUBDOMAIN = "fourieranalys.workers.dev"

# Noise words that suggest a signal isn't actually news
NOISE = re.compile(
    r"\b(release[sd]?|new images?|publishes?|update[sd]?|preview|"
    r"launches?|announces? version|available now|PR|episode|"
    r"character count|game|tv series|v\d+\.\d+)\b",
    re.I,
)
# High-signal words
SIGNAL = re.compile(
    r"\b(acqui(?:re|red|sition)|merger|IPO|filed|13F|13D|"
    r"announces.*(?:acquisition|deal|partnership)|"
    r"raises \$|valuation|layoffs?|earnings)\b",
    re.I,
)


def load_history():
    if not HISTORY.exists():
        return []
    rows = []
    for line in HISTORY.read_text().splitlines():
        if not line.strip():
            continue
        try:
            e = json.loads(line)
            if e.get("summary", "").lower() == "quiet":
                continue
            rows.append(e)
        except Exception:
            continue
    return rows


def classify_quality(summary):
    if not summary:
        return "empty"
    if SIGNAL.search(summary):
        return "signal"
    if NOISE.search(summary):
        return "noise"
    return "meh"


def main():
    events = load_history()
    if not events:
        print("no history yet — come back in 24h")
        return 0

    # Per-worker stats
    by_worker = defaultdict(list)

    # Include every probed worker, even if silent (never fired)
    STATE = ROOT / "reports" / ".signal_state.json"
    if STATE.exists():
        try:
            state = json.loads(STATE.read_text())
            for name in state:
                by_worker[name]  # create empty entry
        except Exception:
            pass

    for e in events:
        by_worker[e["worker"]].append(e)

    # Time span
    times = [e["ts"] for e in events]
    span_h = 1
    try:
        t0 = datetime.fromisoformat(min(times).replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(max(times).replace("Z", "+00:00"))
        span_h = max(1, (t1 - t0).total_seconds() / 3600)
    except Exception:
        pass

    # Score each worker
    rows = []
    for worker, evs in by_worker.items():
        n = len(evs)
        signals = sum(1 for e in evs if classify_quality(e.get("summary", "")) == "signal")
        noise = sum(1 for e in evs if classify_quality(e.get("summary", "")) == "noise")
        rate = n / span_h * 24  # signals/day
        quality = (signals - noise) / max(n, 1)

        if n == 0:
            verdict = "DEAD — no signals ever"
        elif quality < -0.3:
            verdict = "NOISY — mostly PR/generic"
        elif quality >= 0.5 and rate >= 0.5:
            verdict = "★ KEEP — high signal"
        elif rate < 0.1:
            verdict = "SLOW — 1 signal/week max"
        else:
            verdict = "ok"

        rows.append({
            "worker": worker,
            "n": n,
            "signals": signals,
            "noise": noise,
            "rate_per_day": round(rate, 2),
            "quality": round(quality, 2),
            "verdict": verdict,
        })

    rows.sort(key=lambda r: (-r["quality"], -r["n"]))

    print(f"{'WORKER':<28} {'N':>3} {'SIG':>3} {'NOISE':>5} {'/DAY':>6} {'QUAL':>6}  VERDICT")
    print("-" * 90)
    for r in rows:
        print(f"{r['worker']:<28} {r['n']:>3} {r['signals']:>3} {r['noise']:>5} "
              f"{r['rate_per_day']:>6} {r['quality']:>6}  {r['verdict']}")

    print()
    keep = [r for r in rows if "KEEP" in r["verdict"]]
    noisy = [r for r in rows if "NOISY" in r["verdict"]]
    dead = [r for r in rows if "DEAD" in r["verdict"]]

    print(f"KEEP ({len(keep)}): {', '.join(r['worker'] for r in keep) or 'none yet'}")
    print(f"NOISY ({len(noisy)}): {', '.join(r['worker'] for r in noisy) or 'none'}")
    print(f"DEAD ({len(dead)}): {', '.join(r['worker'] for r in dead) or 'none'}")
    print()
    print("Recommendation:")
    if not keep:
        print("  → Wait 7 days of history before deciding. Not enough data.")
    elif noisy:
        print(f"  → Fix/remove noisy workers: {', '.join(r['worker'] for r in noisy)}")
    elif dead:
        print(f"  → Delete dead workers after 7 days: {len(dead)} workers never fired")
    else:
        print("  → Fleet is firing. Add more high-signal sectors.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
