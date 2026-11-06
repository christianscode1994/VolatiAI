import json
import time

def log_event(event):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(json.dumps({"ts": ts, **event}))
