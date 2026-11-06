import time
from functools import lru_cache

DEFAULT_TTL = 30  # seconds

class TTLCache:
    def __init__(self, ttl: int = DEFAULT_TTL):
        self.ttl = ttl
        self.store = {}

    def get(self, key):
        entry = self.store.get(key)
        if not entry:
            return None
        value, ts = entry
        if time.time() - ts > self.ttl:
            del self.store[key]
            return None
        return value

    def set(self, key, value):
        self.store[key] = (value, time.time())
