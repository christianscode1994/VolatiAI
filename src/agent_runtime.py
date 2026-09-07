import json
import os
import requests

class SnapshotStore:
    def __init__(self, path):
        self.path = path
        self._data = self._load()

    def _load(self):
        if not os.path.exists(self.path):
            return {}
        with open(self.path, "r") as f:
            return json.load(f)

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value

    def persist(self):
        with open(self.path, "w") as f:
            json.dump(self._data, f, indent=2)

class ModeDetector:
    def __init__(self, ping_url):
        self.ping_url = ping_url

    def detect(self):
        try:
            requests.get(self.ping_url, timeout=3)
            return "online"
        except Exception:
            return "offline"
