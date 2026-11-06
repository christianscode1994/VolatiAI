#!/usr/bin/env python3
"""Probe every deployed worker using curl (not urllib)."""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUBDOMAIN = "fourieranalys.workers.dev"
TIMEOUT = 10

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

def curl(url):
    """Returns (http_code_or_None, body, ms_or_None)."""
    t0 = time.time()
    try:
        r = subprocess.run(
            ["curl", "-sS", "-m", str(TIMEOUT), "-w", "\n%{http_code}", url],
            capture_output=True, timeout=TIMEOUT + 5,
        )
        ms = round((time.time() - t0) * 1000)
        parts = r.stdout.rsplit(b"\n", 1)
        if len(parts) == 2:
            body, code_b = parts[0], parts[1].strip()
            try:
                return (int(code_b), body, ms)
            except ValueError:
                return (None, body, ms)
        return (None, r.stdout, ms)
    except Exception:
        return (None, b"", None)

def check_worker(name):
    base = f"https://{name}.{SUBDOMAIN}"
    r = {"name": name}

    status, _, ms = curl(base + "/health")
    r["responds"] = status is not None
    r["health_endpoint"] = status == 200
    r["health_ms"] = ms

    status, body, _ = curl(base + "/signal")
    r["signal_ok"] = status == 200
    r["has_signal"] = None
    r["summary"] = None
    r["link"] = None
    if status == 200:
        try:
            data = json.loads(body)
            r["has_signal"] = data.get("has_signal")
            r["summary"] = data.get("summary")
            r["link"] = (data.get("context") or {}).get("link")
        except json.JSONDecodeError:
            pass
    return r

def main():
    workers = discover_workers()
    if not workers:
        print("No wrangler.toml found", file=sys.stderr)
        return 1

    print(f"Probing {len(workers)} worker(s)\n")
    print(f"{'WORKER':<28} {'HEALTH':<8} {'SIG?':<6} {'MS':<6} {'SUMMARY'}")
    print("-" * 100)

    results, n_healthy, n_signalling = [], 0, 0
    for name in workers:
        r = check_worker(name)
        results.append(r)
        h = "✓" if r["responds"] else "✗"
        if r["has_signal"] is True:
            sig = "YES"; n_signalling += 1
        elif r["has_signal"] is False:
            sig = "no"
        else:
            sig = "?"
        ms = str(r["health_ms"]) if r["health_ms"] is not None else "-"
        summary = (r["summary"] or "")[:38]
        print(f"{name:<28} {h:<8} {sig:<6} {ms:<6} {summary}")
        if r["responds"]:
            n_healthy += 1

    print(f"\n{n_healthy}/{len(workers)} healthy, {n_signalling} signalling right now")

    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    (out / "worker_health.json").write_text(json.dumps({
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "workers": results,
    }, indent=2))
    print(f"\nFull report: reports/worker_health.json")
    return 0

if __name__ == "__main__":
    sys.exit(main())
