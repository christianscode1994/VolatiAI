#!/usr/bin/env python3
"""Generate and sign a daily operations report.

Publishes docs/ops/YYYY-MM-DD.json containing aggregate operational
metrics, signed with the same Ed25519 key that signs snapshots.

Contents:
  - Current revision + snapshot hash (links to current.json)
  - Chain continuity status (does today's prev_hash match yesterday's?)
  - Sector health (total / healthy / failed)
  - Recent snapshots signature presence

No PII. No tool-call counts. No per-request data. Pure aggregate.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP_DIR = ROOT / "docs" / "snapshots"
OPS_DIR = ROOT / "docs" / "ops"
CURRENT_PATH = ROOT / "docs" / "current.json"

OPS_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(ROOT / "scripts"))
try:
    from sign_snapshot import sign_envelope
except Exception as e:
    print(f"❌ cannot import sign_snapshot: {e}", file=sys.stderr)
    sys.exit(2)


def load_json(path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# === Latest snapshot stats ===
latest_snap = None
latest_snap_path = None
for f in sorted(SNAP_DIR.glob("*.json"), reverse=True):
    data = load_json(f)
    if data:
        latest_snap = data
        latest_snap_path = f
        break

total = latest_snap.get("total", 0) if latest_snap else 0
ok = latest_snap.get("ok", 0) if latest_snap else 0
failed = latest_snap.get("failed", 0) if latest_snap else 0
healthy_pct = round(ok / total * 100, 2) if total else 0

# === Chain continuity ===
chain_intact = None
if latest_snap and latest_snap.get("prev_hash"):
    for prev_file in sorted(SNAP_DIR.glob("*.json"), reverse=True)[1:]:
        prev = load_json(prev_file)
        if prev and prev.get("hash") == latest_snap["prev_hash"]:
            chain_intact = True
            break
    if chain_intact is None:
        chain_intact = False
elif latest_snap and not latest_snap.get("prev_hash"):
    chain_intact = None  # genesis — no prev to check

# === Recent snapshots signature presence ===
signed_count = 0
unsigned_count = 0
recent_signed = []
for snap_file in sorted(SNAP_DIR.glob("*.json"), reverse=True)[:7]:
    snap = load_json(snap_file)
    if not snap:
        continue
    if snap.get("signature") and snap.get("hash"):
        signed_count += 1
        recent_signed.append({
            "date": snap_file.stem,
            "hash": snap.get("hash"),
            "pubkey_id": snap.get("pubkey_id"),
        })
    else:
        unsigned_count += 1

# === Current revision ===
current = load_json(CURRENT_PATH) or {}

# === Assemble ===
report = {
    "date": today,
    "generated_at": now_iso,
    "current_revision": current.get("revision"),
    "current_snapshot_hash": current.get("snapshot_hash"),
    "chain_intact": chain_intact,
    "sectors": {
        "total": total,
        "healthy": ok,
        "failed": failed,
        "healthy_pct": healthy_pct,
    },
    "recent_snapshots": {
        "signed_count": signed_count,
        "unsigned_count": unsigned_count,
        "signed": recent_signed[:4],
    },
    "pubkey_url": ".well-known/volatiai-pubkey.pem",
}

# === Sign ===
signed_report = sign_envelope(report)

# === Write ===
out = OPS_DIR / f"{today}.json"
out.write_text(json.dumps(signed_report, indent=2) + "\n")

if signed_report.get("envelope_signature"):
    print(f"✓ ops report signed: {out}")
    print(f"  healthy: {ok}/{total} ({healthy_pct}%)")
    print(f"  chain_intact: {chain_intact}")
    print(f"  signed_count: {signed_count}, unsigned_count: {unsigned_count}")
    print(f"  signature: {signed_report['envelope_signature'][:16]}...")
else:
    print(f"⚠️ ops report written UNSIGNED: {out}")
    print(f"  (VOLATIAI_PRIVKEY not set or invalid)")
