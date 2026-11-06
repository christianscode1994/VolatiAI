#!/usr/bin/env python3
"""signal_notifier.py — post one Discord message per NEW high-severity signal.

Iterates all active sectors via the three public workers.
Filters: has_signal == true AND severity == 'alert' AND confidence >= 1.
Dedupe: sector + hash(summary), 7-day window.
State: .signal-notify-state.json (git-tracked, committed by workflow).
"""
import hashlib
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTORS_FILE = ROOT / "config" / "active_sectors.json"
STATE_FILE = ROOT / ".signal-notify-state.json"
WORKERS = ["sparse", "dense", "slow"]
MAX_PER_RUN = 5
DEDUPE_WINDOW_DAYS = 7
CONCURRENCY = 5

def fetch_sector(name):
    for w in WORKERS:
        url = f"https://sector-{w}.fourieranalys.workers.dev/{name}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolatiAI-Notifier/1.0"})
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    data = json.loads(r.read())
                    if "error" not in data:
                        return data
        except Exception:
            continue
    return None

def post_discord(webhook_url, content):
    data = json.dumps({"content": content[:1900], "username": "VolatiAI Alerts"}).encode()
    req = urllib.request.Request(
        webhook_url, data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except Exception as e:
        print(f"discord post failed: {e}", file=sys.stderr)
        return False

def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"notified": {}}

def save_state(state):
    # prune entries older than window
    cutoff = (datetime.now(timezone.utc) - timedelta(days=DEDUPE_WINDOW_DAYS)).isoformat()
    notified = state.get("notified", {})
    state["notified"] = {k: v for k, v in notified.items() if v.get("seen_at", "") >= cutoff}
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")

def main():
    if not SECTORS_FILE.exists():
        print("no config/active_sectors.json — skip")
        return 0
    sectors = json.loads(SECTORS_FILE.read_text())
    print(f"checking {len(sectors)} sectors across {len(WORKERS)} workers")

    alerts = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for data in pool.map(fetch_sector, sectors):
            if not data:
                continue
            if (data.get("has_signal") and
                data.get("severity") == "alert" and
                (data.get("confidence") or 0) >= 1):
                alerts.append(data)
    print(f"found {len(alerts)} alert-level sectors")

    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print("no DISCORD_WEBHOOK_URL — skip posting")
        return 0

    state = load_state()
    notified = state.setdefault("notified", {})

    posted = 0
    failed = 0
    for s in alerts:
        if posted >= MAX_PER_RUN:
            print(f"hit MAX_PER_RUN={MAX_PER_RUN}, deferring {len(alerts) - posted - failed} to next run")
            break
        sector = s.get("sector") or "?"
        summary = (s.get("summary") or "").strip()[:1500] or "(no summary)"
        ts = s.get("timestamp") or ""
        key = f"{sector}:{hashlib.sha256(summary.encode()).hexdigest()[:12]}"
        if key in notified:
            continue
        msg = f"🚨 **{sector}**"
        if ts:
            msg += f"\n`{ts}`"
        msg += f"\n\n{summary}\n\n"
        msg += f"<https://sector-slow.fourieranalys.workers.dev/{sector}|Details>"
        if post_discord(webhook, msg):
            notified[key] = {"seen_at": datetime.now(timezone.utc).isoformat(), "sector": sector}
            posted += 1
        else:
            failed += 1

    if posted > 0 or failed > 0:
        save_state(state)
    print(f"posted: {posted}, failed: {failed}, already-notified: {len(alerts) - posted - failed}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
