#!/usr/bin/env python3
"""build_message.py — signal-aware message with cluster dedup."""
import json, os, sys, subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def _run_cluster_signals():
    """Invoke cluster_signals.py to get current outliers + clusters."""
    try:
        out = subprocess.run(
            ["python3", "scripts/cluster_signals.py"],
            capture_output=True, text=True, timeout=20,
            cwd=str(Path(__file__).parent.parent))
        if out.returncode == 0:
            return json.loads(out.stdout)
    except Exception:
        pass
    return None


URL = "https://christianscode1994.github.io/VolatiAI/d.html"
DID = "did:web:christianscode1994.github.io"
NPUB = "npub1ffnr0nau5rlajjf2syyqn287vvqjd04eld0cdrqayt520g8hznrs6nrwlq"
BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")

def fetch_json(url):
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","10",url], capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None


def _verify_or_die(d):
    """Verify /latest signature before displaying. Refuse if invalid."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from scripts.verify_signature import verify as _v
        with open(BASE_DIR / "docs" / ".well-known" / "volatiai-key.json") as f:
            pub = json.load(f)["publicKeyHex"]
        r = _v(d, pub)
        if r is False:
            print(f"🚨 SIGNATURE INVALID — refusing to publish", file=sys.stderr)
            sys.exit(1)
        elif r is True:
            print(f"✅ signature valid", file=sys.stderr)
        else:
            print(f"⚠️  unsigned payload (no signature field)", file=sys.stderr)
    except FileNotFoundError as e:
        print(f"⚠️  verify skipped: key file missing ({e})", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  verify exception: {type(e).__name__}: {e}", file=sys.stderr)


try:
    d = json.load(sys.stdin)
except Exception:
    print(f"VolatiAI · pipeline unreachable\n→ {URL}")
    sys.exit(0)

_verify_or_die(d)
signals = [r for r in d.get("rows", []) if r.get("has_signal")]
total = d.get("with_history", 0)

# Load cluster graph if available
try:
    graph = json.loads((BASE_DIR / "config" / "graph.json").read_text())
    s2c = graph.get("sector_to_cluster", {})
except Exception:
    s2c = {}

if not signals:
    print(f"VolatiAI · {total} sectors active · all quiet\n→ {URL}\ndid: {DID}")
    sys.exit(0)

# Load cluster analysis
analysis = _run_cluster_signals() or {}
clusters_firing = analysis.get("clusters_firing", [])
outliers = analysis.get("outliers", [])

lines = [f"VolatiAI · {len(signals)} signal(s)"]

# 1. Cluster summaries with momentum (dedup the firehose)
for c in clusters_firing[:2]:
    arrow = "▼" if c["avg_pct"] < 0 else "▲"
    mom = ""
    if c.get("momentum") is not None:
        mom = f", {c['acceleration']}" if c['acceleration'] else ""
    lines.append(f"{c['cluster_id']} ×{c['firing_count']}: {c['avg_pct']:+.1f}% {arrow}{mom}")

# 2. Outliers — THE signal worth posting
for o in outliers[:2]:
    arrow = "▲" if o["z_score"] > 0 else "▼"
    lines.append(
        f"⚠ {o['sector']} {o['pct']:+.1f}% {arrow} "
        f"({o['z_score']:+.1f}σ vs {o['cluster_id']})"
    )

# 3. Remaining singles (non-clustered, non-outlier)
handled = {c["cluster_id"] for c in clusters_firing} | {o["sector"] for o in outliers}
singles = [r for r in signals
           if r["sector"] not in handled and r["sector"] not in s2c]
for r in sorted(singles, key=lambda x: abs(x.get("pct_change", 0) or 0), reverse=True)[:2]:
    pct = r.get("pct_change") or 0
    cur = r.get("current", 0)
    cur_s = (f"{cur:,.2f}" if abs(cur) >= 1 else f"{cur:.4g}") if isinstance(cur, (int, float)) else str(cur)
    lines.append(f"{r['sector']}: {cur_s} ({pct:+.1f}%)")

lines.append(f"→ {URL}")
lines.append(f"did: {DID}")
print("\n".join(lines))
