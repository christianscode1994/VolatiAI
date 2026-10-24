#!/usr/bin/env python3
"""
volatiai_alert.py — push warn/critical sectors to ntfy.sh (free, keyless, no signup).

Setup (one-time):
    export VOLATIAI_NTFY_TOPIC="volati-$(openssl rand -hex 6)"
    # Save that topic! Open https://ntfy.sh/<your-topic> to subscribe.

Usage:
    ./volatiai_alert.py             # send if any warn+
    ./volatiai_alert.py --dry-run   # print what would be sent
    ./volatiai_alert.py --all       # include info too
"""
import json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

TOPIC = os.environ.get("VOLATIAI_NTFY_TOPIC", "").strip()
BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
UA = os.environ.get("VOLATIAI_UA", "VolatiAI/1.0 (alert)")
TIMEOUT = 20

def fetch_signal(sector):
    url = f"{BASE}/{sector}/signal"
    try:
        req = urllib.request.Request(url, headers={"user-agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(
            ["curl", "-sfL", "--max-time", str(TIMEOUT), "-A", UA, url],
            capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

def ntfy(title, message, priority="default", tags=None):
    if not TOPIC:
        print(f"[no topic] {title}: {message}", file=sys.stderr)
        return
    headers = {"Title": title, "Priority": priority}
    if tags:
        headers["Tags"] = ",".join(tags)
    req = urllib.request.Request(
        f"https://ntfy.sh/{TOPIC}",
        data=message.encode("utf-8"),
        headers=headers,
        method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()

def main():
    dry_run = "--dry-run" in sys.argv
    include_info = "--all" in sys.argv

    sectors = json.loads(Path("config/active_sectors.json").read_text())
    alerts = []
    with ThreadPoolExecutor(max_workers=20) as ex:
        for fut in as_completed({ex.submit(fetch_signal, s): s for s in sectors}):
            data = fut.result()
            if not data:
                continue
            sev = data.get("severity", "info")
            if sev in ("warn", "critical") or (include_info and sev == "info"):
                d = data.get("delta", {})
                alerts.append({
                    "sector": data.get("sector"),
                    "severity": sev,
                    "pct": d.get("pct_change"),
                    "current": d.get("current"),
                })

    if not alerts:
        print("no alerts — all quiet")
        return

    alerts.sort(key=lambda a: (a["severity"] != "critical", -abs(a["pct"] or 0)))
    crit = sum(1 for a in alerts if a["severity"] == "critical")
    title = f"VolatiAI: {len(alerts)} alert{'s' if len(alerts)!=1 else ''}"
    if crit:
        title = f"VolatiAI: {crit} CRITICAL"
    body = "\n".join(
        f"{a['sector']:<30} {a['severity']:<8} "
        f"{(a['pct'] or 0):+7.2f}%  →  {a['current']}"
        for a in alerts[:25])

    if dry_run:
        print(f"[DRY RUN] topic=https://ntfy.sh/{TOPIC or 'UNSET'}")
        print(f"Title: {title}")
        print(body)
        return

    priority = "urgent" if crit else ("high" if alerts else "default")
    ntfy(title, body, priority=priority, tags=["chart_with_upwards_trend"])
    print(f"sent {len(alerts)} alerts to ntfy.sh/{TOPIC}")

if __name__ == "__main__":
    main()
