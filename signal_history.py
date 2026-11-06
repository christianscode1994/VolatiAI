#!/usr/bin/env python3
"""Poll every sector worker, append any CHANGE to reports/signal_history.jsonl.

State file (reports/.signal_state.json) tracks last-known signature per worker.
New signature → new entry in history. Unchanged → skipped.

Run this on a schedule (cron / GitHub Action) so signals that fire for one
poll cycle still get captured, even if nobody runs the digest.
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUBDOMAIN = "fourieranalys.workers.dev"
TIMEOUT = 10
HISTORY = ROOT / "reports" / "signal_history.jsonl"
STATE = ROOT / "reports" / ".signal_state.json"

SKIP = {
    "sector-slow", "sector-sparse", "sector-dense",
    "interop-messaging", "protocols-tvl", "scaling-l2",
    "web3-identity",
}


def discover_workers():
    out = []
    wdir = ROOT / "workers"
    if not wdir.exists():
        return out
    for d in sorted(wdir.iterdir()):
        if not d.is_dir():
            continue
        wr = d / "wrangler.toml"
        if not wr.exists():
            continue
        text = wr.read_text(errors="ignore")
        m = re.search(r'^name\s*=\s*"([^"]+)"', text, re.M)
        if m:
            out.append(m.group(1))
    return out


def curl_signal(name):
    url = f"https://{name}.{SUBDOMAIN}/signal"
    try:
        r = subprocess.run(
            ["curl", "-sS", "-m", str(TIMEOUT), url],
            capture_output=True, timeout=TIMEOUT + 5,
        )
        if r.returncode != 0 or not r.stdout:
            return None
        return json.loads(r.stdout)
    except Exception:
        return None


def signature(data):
    """What makes this state 'new' vs 'same'?"""
    ctx = data.get("context") or {}
    return (
        ctx.get("current_id")
        or ctx.get("last_event_id")
        or ctx.get("link")
        or (data.get("summary") or "").strip()
    )


def main():
    workers = [w for w in discover_workers() if w not in SKIP]
    if not workers:
        print("no sector workers found", file=sys.stderr)
        return 1

    STATE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}

    ts = datetime.now(timezone.utc).isoformat()
    new_count = 0
    with HISTORY.open("a") as f:
        for name in workers:
            data = curl_signal(name)
            if not data:
                continue
            sig = signature(data)
            if not sig:
                continue
            if state.get(name) == sig:
                continue  # unchanged
            entry = {
                "ts": ts,
                "worker": name,
                "sector": data.get("sector", name),
                "has_signal": bool(data.get("has_signal")),
                "summary": (data.get("summary") or "").strip(),
                "link": (data.get("context") or {}).get("link") or "",
                "signature": sig,
            }
            f.write(json.dumps(entry) + "\n")
            state[name] = sig
            new_count += 1
            print(f"  + {name}: {entry['summary'][:70]}")

    STATE.write_text(json.dumps(state, indent=2))
    print(f"\n{new_count} new event(s) appended to {HISTORY.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
