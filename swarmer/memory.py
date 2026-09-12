import time
from collections import deque

MEMORY_SIZE = 200
EVENT_MEMORY = deque(maxlen=MEMORY_SIZE)

def remember_event(event):
    EVENT_MEMORY.append({
        "ts": time.time(),
        "type": event.get("type"),
        "value": event.get("value"),
    })

def recent_events_of_type(event_type, window_seconds=600):
    cutoff = time.time() - window_seconds
    return [
        e for e in EVENT_MEMORY
        if e["type"] == event_type and e["ts"] >= cutoff
    ]

def is_repeated_pattern(event_type, threshold=10, window_seconds=600):
    return len(recent_events_of_type(event_type, window_seconds)) >= threshold
