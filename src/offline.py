# src/offline.py

"""
Offline snapshot + mode detection for VolatiAI agents.

- mode.detect() decides "online" vs "offline"
- snap.set(key, value) stores last successful data
- snap.get(key, default) retrieves cached data
- snap.persist() writes to disk (JSON)
"""

import json
import os
from typing import Any, Dict


SNAP_PATH = os.path.join("agents", "market_agent", "snapshots.json")


class SnapStore:
    def __init__(self, path: str = SNAP_PATH):
        self.path = path
        self._data: Dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.path):
            try:
                with open(self.path, "r") as f:
                    self._data = json.load(f)
            except Exception:
                self._data = {}
        else:
            self._data = {}

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def persist(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w") as f:
            json.dump(self._data, f, indent=2)


class Mode:
    """
    Very simple mode detection:
    - Try to assume "online" by default.
    - You can later plug in health checks (RPC, APIs, etc.).
    """

    def detect(self) -> str:
        # For now: always online. You can add real checks later.
        return "online"


snap = SnapStore()
mode = Mode()
