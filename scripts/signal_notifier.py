#!/usr/bin/env python3
"""Poll workers, post to Slack on has_signal=true."""
import json
import os
import sys
import urllib.request

WORKERS = {
    "13f-holdings": "https://sector-13f.fourieranalys.workers.dev",
}

def main():
    hook = os.environ.get("SLACK_WEBHOOK")
    if not hook:
        print("SLACK_WEBHOOK env var not set", file=sys.stderr)
        return 1

    posted = 0
    for name, url in WORKERS.items():
        try:
            with urllib.request.urlopen(url + "/signal", timeout=10) as r:
                data = json.loads(r.read())
        except Exception as e:
            print(f"{name}: fetch failed: {e}", file=sys.stderr)
            continue

        if data.get("has_signal"):
            msg = f"*{name}*: {data.get('summary', 'signal')}\n<{data.get('context', {}).get('link', '')}|open>"
            req = urllib.request.Request(
                hook,
                data=json.dumps({"text": msg}).encode(),
                headers={"Content-Type": "application/json"},
            )
            try:
                urllib.request.urlopen(req, timeout=10)
                posted += 1
                print(f"{name}: posted")
            except Exception as e:
                print(f"{name}: post failed: {e}", file=sys.stderr)

    print(f"posted {posted}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
