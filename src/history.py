from datetime import datetime, timedelta
from pathlib import Path
import json
import gzip
from typing import Optional, List, Dict, Any

# --- CONFIG ---

HISTORY_RETENTION_DAYS = 30

METRIC_SCHEMAS: dict[str, set[str]] = {
    "whales": {"score", "exchanges", "timestamp"},
    "spoofing": {"score", "markets", "timestamp"},
    "liquidity": {"score", "pairs", "timestamp"},
}


# --- TIMESTAMP HELPERS ---

def current_ts() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H-%M")


def parse_ts_from_filename(name: str) -> datetime | None:
    base = name
    if base.endswith(".json.gz"):
        base = base[:-8]
    elif base.endswith(".json"):
        base = base[:-5]

    try:
        return datetime.strptime(base, "%Y-%m-%dT%H-%M")
    except ValueError:
        return None


# --- SCHEMA VALIDATION ---

def validate_metric_schema(metric: str, data: dict) -> None:
    required = METRIC_SCHEMAS.get(metric)
    if not required:
        return

    missing = required - data.keys()
    if missing:
        raise ValueError(
            f"Snapshot for metric '{metric}' missing required keys: {sorted(missing)}"
        )


# --- ROTATION ---

def rotate_snapshots(metric: str) -> None:
    folder = Path("history") / metric

    # CI-safe directory check
    if not folder.exists():
        return
    if not folder.is_dir():
        raise NotADirectoryError(f"{folder} exists but is not a directory")

    cutoff = datetime.utcnow() - timedelta(days=HISTORY_RETENTION_DAYS)

    for entry in folder.iterdir():
        if not entry.is_file():
            continue

        ts = parse_ts_from_filename(entry.name)
        if ts is None:
            continue

        if ts < cutoff:
            try:
                entry.unlink()
            except OSError:
                pass


# --- SNAPSHOT WRITER ---

def write_snapshot(metric: str, data: dict) -> str:
    validate_metric_schema(metric, data)

    ts = current_ts()
    folder = Path("history") / metric

    # CI-safe directory creation
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)
    elif not folder.is_dir():
        raise NotADirectoryError(f"{folder} exists but is not a directory")

    final_path = folder / f"{ts}.json.gz"
    tmp_path = folder / f"{ts}.tmp.json.gz"

    # Atomic write
    with gzip.open(tmp_path, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)

    tmp_path.replace(final_path)

    rotate_snapshots(metric)

    return str(final_path)


# --- SNAPSHOT READER API ---

def list_snapshot_files(metric: str) -> List[Path]:
    folder = Path("history") / metric

    # CI-safe directory check
    if not folder.exists() or not folder.is_dir():
        return []

    return sorted(
        [p for p in folder.iterdir() if p.is_file() and p.name.endswith(".json.gz")],
        key=lambda p: p.name,
    )


def read_snapshot_file(path: Path) -> Dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def read_latest_snapshot(metric: str) -> Optional[Dict[str, Any]]:
    files = list_snapshot_files(metric)
    if not files:
        return None
    return read_snapshot_file(files[-1])


def read_snapshots(metric: str, days: int) -> List[Dict[str, Any]]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    out: List[Dict[str, Any]] = []

    for p in list_snapshot_files(metric):
        ts = parse_ts_from_filename(p.name)
        if ts is None or ts < cutoff:
            continue
        out.append(read_snapshot_file(p))

    return out
