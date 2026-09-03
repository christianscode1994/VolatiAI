from datetime import datetime, timedelta
from pathlib import Path
import json
import gzip

# --- CONFIG ---

# How many days of history to keep per metric
HISTORY_RETENTION_DAYS = 30

# Simple per-metric schema: required keys in the data dict
METRIC_SCHEMAS: dict[str, set[str]] = {
    "whales": {"score", "exchanges", "timestamp"},
    "spoofing": {"score", "markets", "timestamp"},
    "liquidity": {"score", "pairs", "timestamp"},
    # add more metrics here as you formalize them
}


def current_ts() -> str:
    """
    Returns a filesystem-safe timestamp like: 2026-09-02T22-44
    """
    return datetime.utcnow().strftime("%Y-%m-%dT%H-%M")


def parse_ts_from_filename(name: str) -> datetime | None:
    """
    Parse timestamp from a filename like '2026-09-02T22-44.json.gz'.
    Returns None if parsing fails.
    """
    # Strip extensions
    base = name
    if base.endswith(".json.gz"):
        base = base[:-8]
    elif base.endswith(".json"):
        base = base[:-5]

    try:
        return datetime.strptime(base, "%Y-%m-%dT%H-%M")
    except ValueError:
        return None


def validate_metric_schema(metric: str, data: dict) -> None:
    """
    Validate that 'data' matches the expected schema for 'metric'.
    Currently: checks required keys only.
    Raises ValueError if validation fails.
    """
    required = METRIC_SCHEMAS.get(metric)
    if not required:
        # No schema defined → allow, but you can tighten this later.
        return

    missing = required - data.keys()
    if missing:
        raise ValueError(
            f"Snapshot for metric '{metric}' missing required keys: {sorted(missing)}"
        )


def rotate_snapshots(metric: str) -> None:
    """
    Delete snapshots older than HISTORY_RETENTION_DAYS for the given metric.
    Operates on files in history/<metric>/.
    """
    folder = Path("history") / metric
    if not folder.exists() or not folder.is_dir():
        return

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
                # Best-effort; ignore failures
                pass


def write_snapshot(metric: str, data: dict) -> str:
    """
    Writes a snapshot for a given metric into history/<metric>/<timestamp>.json.gz
    - Validates schema (if defined)
    - Writes atomically via temp file + rename
    - Compresses using gzip
    - Rotates old snapshots (keep last N days)
    Returns the full path for logging/debugging.
    """
    # 1. Validate schema
    validate_metric_schema(metric, data)

    # 2. Build paths
    ts = current_ts()
    folder = Path("history") / metric

    # Ensure folder exists and is a directory (CI-safe)
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)
    elif not folder.is_dir():
        raise NotADirectoryError(f"{folder} exists but is not a directory")

    final_path = folder / f"{ts}.json.gz"
    tmp_path = folder / f"{ts}.tmp.json.gz"

    # 3. Atomic write: write to tmp, then rename
    with gzip.open(tmp_path, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)

    # Rename is atomic on POSIX filesystems
    tmp_path.replace(final_path)

    # 4. Rotate old snapshots
    rotate_snapshots(metric)

    return str(final_path)
