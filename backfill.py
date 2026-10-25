#!/usr/bin/env python3
"""Backfill 30 days of history for sectors with native historical APIs."""
import json, subprocess, time, urllib.request, sys
from datetime import datetime, timezone

NS = "5a2afb46033e49dc8d2ddefac347ddb5"

def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"user-agent": "VolatiAI/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(["curl","-sfL","--max-time","20","-A","VolatiAI/1.0",url],
                             capture_output=True, text=True)
        if out.returncode != 0:
            raise RuntimeError(f"curl {out.returncode}: {out.stderr[:80]}")
        return json.loads(out.stdout)

def kv_put(key, value_bytes, verify=True, retries=3):
    time.sleep(2)  # rate limit cushion
    for attempt in range(retries):
        proc = subprocess.run(
            ["npx", "wrangler", "kv", "key", "put",
             "--namespace-id", NS, key,
             "--path", "/tmp/backfill_payload.json", "--remote"],
            capture_output=True, text=True,
            cwd="/Users/fourieranalys/VolatiAI/workers/sector-slow"
        )
        if proc.returncode == 0:
            break
        stderr = proc.stderr or ""
        if "rate" in stderr.lower() or "429" in stderr:
            print(f"    rate-limited, waiting {2**(attempt+1)}s...")
            time.sleep(2 ** (attempt + 1))
            continue
        raise RuntimeError(f"kv put failed: {stderr[:200]}")
    else:
        raise RuntimeError(f"kv put failed after {retries} retries")
    if verify:
        # Verify by re-reading
        getp = subprocess.run(
            ["npx", "wrangler", "kv", "key", "get",
             "--namespace-id", NS, key, "--remote"],
            capture_output=True, text=True,
            cwd="/Users/fourieranalys/VolatiAI/workers/sector-slow"
        )
        if getp.returncode != 0 or not getp.stdout.strip():
            raise RuntimeError(f"kv get failed — key not stored")
        try:
            parsed = json.loads(getp.stdout)
            if not isinstance(parsed, list) or len(parsed) == 0:
                raise RuntimeError(f"kv verify: empty or non-list")
        except json.JSONDecodeError:
            raise RuntimeError(f"kv verify: not valid JSON")

def day_iso(ts_seconds):
    return datetime.fromtimestamp(ts_seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def backfill_kraken(pair, days=30):
    j = fetch_json(f"https://api.kraken.com/0/public/OHLC?pair={pair}&interval=1440")
    if j.get("error"):
        raise RuntimeError(f"kraken: {j['error']}")
    key = next(k for k in j["result"] if k != "last")
    rows = j["result"][key][-days:]
    return [{"t": day_iso(int(r[0])), "v": float(r[4])} for r in rows]

def backfill_coinbase(product, days=30):
    j = fetch_json(f"https://api.exchange.coinbase.com/products/{product}/candles?granularity=86400")
    rows = j[:days][::-1]  # oldest first
    return [{"t": day_iso(int(r[0])), "v": float(r[4])} for r in rows]

def backfill_frankfurter(base, quote, days=30):
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days)
    j = fetch_json(f"https://api.frankfurter.dev/v1/{start}..{today}?from={base}&to={quote}")
    rates = j.get("rates", {})
    return [{"t": f"{d}T00:00:00Z", "v": float(v[quote])} for d, v in sorted(rates.items())]

def backfill_nbp_gold(days=30):
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days)
    j = fetch_json(f"https://api.nbp.pl/api/cenyzlota/{start}/{today}/?format=json")
    return [{"t": f"{r['data']}T00:00:00Z", "v": float(r['cena'])} for r in j]

JOBS = {
    # (sector, metric, collector)
    ("kraken-btc-usd", "btc_usd", lambda: backfill_kraken("XBTUSD")),
    ("kraken-eth-usd", "eth_usd", lambda: backfill_kraken("ETHUSD")),
    ("kraken-sol-usd", "sol_usd", lambda: backfill_kraken("SOLUSD")),
    ("kraken-xrp-usd", "xrp_usd", lambda: backfill_kraken("XRPUSD")),
    ("kraken-ada-usd", "ada_usd", lambda: backfill_kraken("ADAUSD")),
    ("kraken-doge-usd", "doge_usd", lambda: backfill_kraken("DOGEUSD")),
    ("kraken-dot-usd", "dot_usd", lambda: backfill_kraken("DOTUSD")),
    ("kraken-link-usd", "link_usd", lambda: backfill_kraken("LINKUSD")),
    ("coinbase-btc-usd", "btc_usd", lambda: backfill_coinbase("BTC-USD")),
    ("coinbase-eth-usd", "eth_usd", lambda: backfill_coinbase("ETH-USD")),
    ("frankfurter-eurusd", "eur_usd", lambda: backfill_frankfurter("EUR", "USD")),
    ("frankfurter-eursek", "eur_sek", lambda: backfill_frankfurter("EUR", "SEK")),
    ("nbp-gold-spot", "pln_per_gram", lambda: backfill_nbp_gold()),
}

# TEST FIRST with one sector
print("=== TEST: kraken-btc-usd ===\n")
test_sector, test_metric, test_fn = "kraken-btc-usd", "btc_usd", lambda: backfill_kraken("XBTUSD")
try:
    pts = test_fn()
    print(f"Fetched {len(pts)} points ({pts[0]['t'][:10]} → {pts[-1]['t'][:10]})")
    payload = json.dumps(pts).encode()
    with open("/tmp/backfill_payload.json", "wb") as f:
        f.write(payload)
    key = f"{test_sector}_{test_metric}_history"
    print(f"KV key: {key}")
    kv_put(key, payload, verify=True)
    print(f"✅ TEST PASSED — {key} stored and verified\n")
except Exception as e:
    print(f"❌ TEST FAILED: {e}")
    print("\nAborting — fix the test sector before batch.")
    sys.exit(1)

# BATCH — only after test passes
print("\n=== BATCH BACKFILL ===\n")
ok, fail = 0, 0
failed = []
for sector, metric, fn in JOBS:
    key = f"{sector}_{metric}_history"
    if sector == "kraken-btc-usd":
        print(f"  SKIP  {key:50} (already done in test)")
        ok += 1
        continue
    try:
        pts = fn()
        if not pts:
            raise RuntimeError("empty")
        payload = json.dumps(pts).encode()
        with open("/tmp/backfill_payload.json", "wb") as f:
            f.write(payload)
        kv_put(key, payload, verify=True)
        print(f"  OK    {key:50} {len(pts)} pts")
        ok += 1
    except Exception as e:
        print(f"  FAIL  {key:50} {str(e)[:60]}")
        fail += 1
        failed.append(sector)

print(f"\n✅ {ok} ok, {fail} failed")
if failed:
    print(f"Failed: {failed}")
