#!/usr/bin/env python3
"""
volatiai_publish.py — post the same text to Telegram, Discord, Slack,
Mastodon, and Bluesky. Reads credentials from env vars.
Each platform is skipped if its env vars are absent.
"""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone

def http_post(url, data, headers=None, method="POST"):
    headers = headers or {}
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read()
    except Exception:
        cmd = ["curl", "-sfL", "--max-time", "15", "-X", method]
        for k, v in headers.items():
            cmd += ["-H", f"{k}: {v}"]
        cmd += ["--data-binary", "@-", url]
        out = subprocess.run(cmd, input=data, capture_output=True)
        return out.stdout if out.returncode == 0 else None

def telegram(text):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat): return "skipped"
    payload = json.dumps({"chat_id": chat, "text": text, "parse_mode": "Markdown",
                          "disable_web_page_preview": True}).encode()
    r = http_post(f"https://api.telegram.org/bot{token}/sendMessage",
                  payload, {"Content-Type": "application/json"})
    return "ok" if r and b'"ok":true' in r else f"fail: {r[:100] if r else 'no response'}"

def discord(text):
    url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not url: return "skipped"
    payload = json.dumps({"content": text[:1900]}).encode()
    r = http_post(url, payload, {"Content-Type": "application/json"})
    return "ok" if r is not None else "fail"

def slack(text):
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url: return "skipped"
    payload = json.dumps({"text": text}).encode()
    r = http_post(url, payload, {"Content-Type": "application/json"})
    return "ok" if r is not None else "fail"

def mastodon(text):
    instance = os.environ.get("MASTODON_INSTANCE") or os.environ.get("MASTODON_SERVER")
    token = os.environ.get("MASTODON_ACCESS_TOKEN")
    if not (instance and token): return "skipped"
    payload = json.dumps({"status": text[:500]}).encode()
    r = http_post(f"https://{instance}/api/v1/statuses", payload,
                  {"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return "ok" if r and b'"id"' in r else "fail"

def bluesky(text):
    handle, password = os.environ.get("BLUESKY_HANDLE"), os.environ.get("BLUESKY_PASSWORD")
    if not (handle and password): return "skipped"
    # Session
    sess_payload = json.dumps({"identifier": handle, "password": password}).encode()
    sess_r = http_post("https://bsky.social/xrpc/com.atproto.server.createSession",
                       sess_payload, {"Content-Type": "application/json"})
    if not sess_r: return "fail: no session"
    sess = json.loads(sess_r)
    jwt, did = sess.get("accessJwt"), sess.get("did")
    # Post
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    post_payload = json.dumps({
        "repo": did,
        "collection": "app.bsky.feed.post",
        "record": {"$type": "app.bsky.feed.post", "text": text[:300],
                   "createdAt": now}
    }).encode()
    r = http_post("https://bsky.social/xrpc/com.atproto.repo.createRecord",
                  post_payload, {"Content-Type": "application/json",
                                 "Authorization": f"Bearer {jwt}"})
    return "ok" if r and b'"uri"' in r else "fail"

def nostr(text):
    priv = os.environ.get("NOSTR_PRIVATE_KEY", "").strip()
    relay = os.environ.get("NOSTR_RELAY", "wss://relay.damus.io").strip()
    if not priv:
        return "skipped (no NOSTR_PRIVATE_KEY)"
    try:
        from pynostr.key import PrivateKey
        from pynostr.event import Event
        from pynostr.relay_manager import RelayManager
        import time
    except ImportError as e:
        return f"fail import: {e}"

    # 1. Key
    try:
        sk = PrivateKey.from_nsec(priv) if priv.startswith("nsec") else PrivateKey(bytes.fromhex(priv))
    except Exception as e:
        return f"fail key: {type(e).__name__}: {e}"

    # 2. Build event — try multiple constructor patterns
    event = None
    for ctor in [
        lambda: Event(content=text[:500], kind=1),
        lambda: Event(text[:500]),
        lambda: Event(content=text[:500]),
    ]:
        try:
            event = ctor()
            break
        except Exception:
            continue
    if event is None:
        return "fail event: all constructor patterns failed"

    # 3. Sign
    try:
        event.sign(sk.hex())
    except Exception as e:
        return f"fail sign: {type(e).__name__}: {e}"

    # 4. Publish — RelayManager
    try:
        rm = RelayManager(timeout=8)
        rm.add_relay(relay)
        rm.publish_event(event)
        rm.run_sync()
        time.sleep(2)
        try: rm.close_all_relay_connections()
        except: pass
        return "ok"
    except Exception as e:
        # Fallback: direct websocket
        try:
            import websocket
            msg = event.to_message() if hasattr(event, "to_message") else None
            if not msg:
                return f"fail publish: {type(e).__name__}: {e} (no to_message for fallback)"
            ws = websocket.create_connection(relay, timeout=10)
            ws.send(msg)
            resp = ws.recv()
            ws.close()
            return "ok (websocket)" if (event.id and event.id in resp) else f"ok (websocket, unconfirmed): {resp[:60]}"
        except Exception as e2:
            return f"fail publish: {type(e).__name__}: {e} (ws: {type(e2).__name__}: {e2})"

PLATFORMS = [
    ("telegram", telegram),
    ("discord", discord),
    ("slack", slack),
    ("mastodon", mastodon),
    ("bluesky", bluesky),
    ("nostr", nostr),
]

def main():
    text = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read().strip()
    if not text:
        sys.exit("no text to publish")
    print(f"Publishing {len(text)} chars to {len(PLATFORMS)} platforms:\n")
    for name, fn in PLATFORMS:
        try:
            status = fn(text)
        except Exception as e:
            status = f"exception: {e}"
        print(f"  {name:<10} {status}")

if __name__ == "__main__":
    main()
