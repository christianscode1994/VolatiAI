#!/usr/bin/env python3
"""
Report worker blocks not in active_sectors.json, sorted by risk.
HIGH  — shares a host with a recently-dropped sector (likely copy-paste bug)
LOW   — harmless dead code, can be pruned anytime
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKERS = ["sparse", "dense", "slow"]

def worker_collectors(worker):
    path = ROOT / f"workers/sector-{worker}/src/index.js"
    if not path.exists():
        return {}
    src = path.read_text()
    m = re.search(r"^const COLLECTORS = \{\s*\n(.*?)^\};", src, re.M | re.S)
    if not m:
        return {}
    out = {}
    for bm in re.finditer(r'^  "([a-z][a-z0-9-]+)": \{\n(.*?)\n  \},', m.group(1), re.M | re.S):
        name, block = bm.group(1), bm.group(2)
        hosts = set(re.findall(r'https?://([^/"\s]+)', block))
        line = src[:src.find(f'"{name}": {{')].count("\n") + 1
        out[name] = {"hosts": hosts, "line": line}
    return out

def main():
    active = set(json.load(open(ROOT / "config/active_sectors.json")))
    themes = set()
    tf = ROOT / "config/theme_sectors.json"
    if tf.exists():
        themes = set(json.load(open(tf))["themes"])

    try:
        log = subprocess.check_output(
            ["git", "log", "--oneline", "-40"],
            cwd=ROOT, text=True, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        log = ""

    dropped_names = set(re.findall(r"drop[ps]?\s+([a-z][a-z0-9-]+(?:-[a-z0-9]+)*)", log, re.I))

    dropped_hosts = set()
    for w in WORKERS:
        for name, info in worker_collectors(w).items():
            if name in dropped_names:
                dropped_hosts |= info["hosts"]

    buckets = defaultdict(list)
    for w in WORKERS:
        for name, info in worker_collectors(w).items():
            if name in active or name in themes:
                continue
            risk = "HIGH" if (info["hosts"] & dropped_hosts) else "LOW"
            buckets[risk].append((w, name, info["line"], sorted(info["hosts"])))

    for risk in ("HIGH", "LOW"):
        items = buckets.get(risk, [])
        if not items:
            continue
        print(f"\n── {risk} ({len(items)}) ──")
        for w, name, line, hosts in items:
            print(f"  {w:6} {name:42} line {line:5}  {','.join(hosts) or '(no url)'}")

    total = sum(len(v) for v in buckets.values())
    print(f"\ntotal stubs: {total}")
    print("\nHIGH stubs share a host with a dropped sector — likely copy-paste bugs.")
    print("LOW stubs are harmless — prune at leisure or leave.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
