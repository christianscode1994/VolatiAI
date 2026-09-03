from datetime import datetime
from pathlib import Path
import json

def current_ts() -> str:
    """
    Returns a filesystem-safe timestamp like: 2026-09-02T22-44
    """
    return datetime.utcnow().strftime("%Y-%m-%dT%H-%M")

def write_snapshot(metric: str, data: dict) -> str:
    """
    Writes a snapshot for a given metric into history/<metric>/<timestamp>.json
    Returns the full path for logging/debugging.
    """
    ts = current_ts()
    path = Path(f"history/{metric}/{ts}.json")
    parent = path.parent

    # --- FIX: GitHub Actions sometimes creates folders as files/symlinks ---
    if not parent.exists():
        parent.mkdir(parents=True, exist_ok=True)
    elif not parent.is_dir():
        raise NotADirectoryError(f"{parent} exists but is not a directory")

    with path.open("w") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)

    return str(path)
