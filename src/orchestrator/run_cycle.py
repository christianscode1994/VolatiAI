import json
import os
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]  # repo root

AGENTS = [
    ("Market Agent", ["python", "agents/market_agent/policy.py"]),
    ("Sentiment Agent", ["python", "agents/sentiment_agent/policy.py"]),
    ("Developer Activity Agent", ["python", "agents/developer_activity_agent/policy.py"]),
    ("Liquidity Agent", ["python", "agents/liquidity_agent/policy.py"]),
    ("Fusion Agent", ["python", "agents/fusion_agent/policy.py"]),
]

INTEL_SCRIPTS = [
    ("trends", ["python", "src/intel/trends.py"]),
    ("narratives", ["python", "src/intel/narratives.py"]),
    ("microstructure", ["python", "src/intel/microstructure.py"]),
    ("rpc_truth", ["python", "src/intel/rpc_truth.py"]),
]

ALERT_SCRIPTS = [
    ("whale", ["python", "src/alerts/whale_alerts.py"]),
    ("spoofing", ["python", "src/alerts/spoofing_alerts.py"]),
    ("trend_accel", ["python", "src/alerts/trend_accel_alerts.py"]),
    ("narrative", ["python", "src/alerts/narrative_alerts.py"]),
]


def run_step(name: str, cmd: list[str]) -> bool:
    print(f"[orchestrator] running: {name} -> {' '.join(cmd)}")
    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[orchestrator] {name} failed: {e}")
        return False


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open() as f:
            return json.load(f)
    except Exception as e:
        print(f"[orchestrator] failed to load {path}: {e}")
        return {}


def build_intel_json() -> dict:
    now = datetime.now(timezone.utc).isoformat()

    signals = {
        "market": load_json(ROOT / "agents/market_agent/memory.json"),
        "sentiment": load_json(ROOT / "agents/sentiment_agent/memory.json"),
        "developer_activity": load_json(ROOT / "agents/developer_activity_agent/memory.json"),
        "liquidity": load_json(ROOT / "agents/liquidity_agent/memory.json"),
        "fusion": load_json(ROOT / "agents/fusion_agent/memory.json"),
    }

    intel = {
        "trends": load_json(ROOT / "public/intel_trends.json"),
        "narratives": load_json(ROOT / "public/intel_narratives.json"),
        "microstructure": load_json(ROOT / "public/intel_microstructure.json"),
        "rpc_truth": load_json(ROOT / "public/intel_rpc_truth.json"),
    }

    alerts = {
        "whale": load_json(ROOT / "public/alerts_whale.json").get("alerts", []),
        "spoofing": load_json(ROOT / "public/alerts_spoofing.json").get("alerts", []),
        "trend_accel": load_json(ROOT / "public/alerts_trend_accel.json").get("alerts", []),
        "narrative": load_json(ROOT / "public/alerts_narrative.json").get("alerts", []),
    }

    return {
        "meta": {
            "timestamp_utc": now,
            "version": "1.0.0",
        },
        "signals": signals,
        "intel": intel,
        "alerts": alerts,
    }


def write_intel_json(payload: dict) -> None:
    out_path = ROOT / "public" / "intel.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
    print(f"[orchestrator] wrote {out_path}")


def append_timeline(payload: dict) -> None:
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    timeline_dir = ROOT / "public" / "timeline"
    timeline_dir.mkdir(parents=True, exist_ok=True)
    path = timeline_dir / f"{day}.json"

    existing = []
    if path.exists():
        try:
            with path.open() as f:
                existing = json.load(f)
        except Exception:
            existing = []

    existing.append(payload)
    with path.open("w") as f:
        json.dump(existing, f, indent=2)
    print(f"[orchestrator] appended timeline entry to {path}")


def main() -> None:
    # 1. run agents
    for name, cmd in AGENTS:
        run_step(name, cmd)

    # 2. run intel modules
    for name, cmd in INTEL_SCRIPTS:
        run_step(f"intel:{name}", cmd)

    # 3. run alerts
    for name, cmd in ALERT_SCRIPTS:
        run_step(f"alert:{name}", cmd)

    # 4. fuse everything into intel.json
    payload = build_intel_json()
    write_intel_json(payload)
    append_timeline(payload)


if __name__ == "__main__":
    main()
