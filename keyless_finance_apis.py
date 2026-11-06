#!/usr/bin/env python3
"""
keyless_finance_apis.py — registry of keyless / open / public / free finance APIs.
No API keys, no signup, no OAuth. Stdlib only.

Usage:
    python3 keyless_finance_apis.py --list [fx equity crypto macro filings]
    python3 keyless_finance_apis.py get <name> [key=val ...]
    python3 keyless_finance_apis.py test [categories...]
"""
from __future__ import annotations
import json, os, sys, time, urllib.request
from typing import Any

UA = os.environ.get(
    "VOLATIAI_UA",
    "VolatiAI/1.0 (christianscode1994@gmail.com)",   # <-- edit or export VOLATIAI_UA
)
TIMEOUT = 15

def _via_curl(url: str, extra_headers: dict | None = None) -> str:
    """Fallback when Python lacks CA certs (macOS python.org, MITM proxies, CI)."""
    import subprocess
    cmd = ["curl", "-sfL", "--max-time", str(TIMEOUT), "-A", UA]
    for k, v in (extra_headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(
            f"curl {out.returncode}: {out.stderr.strip() or 'no response'}"
        )
    return out.stdout

APIS: dict[str, dict[str, Any]] = {
    # ───────────── FX ─────────────
    "frankfurter_currencies": {
        "cat": "fx", "url": "https://api.frankfurter.dev/v1/currencies"},
    "frankfurter_latest": {
        "cat": "fx", "url": "https://api.frankfurter.dev/v1/latest?base={base}",
        "params": {"base": "USD"}},
    "erapi_latest": {
        "cat": "fx", "url": "https://open.er-api.com/v6/latest/{base}",
        "params": {"base": "USD"}},
    "nbp_rates": {
        "cat": "fx", "url": "https://api.nbp.pl/api/exchangerates/tables/A?format=json"},
    "nbp_gold": {
        "cat": "commodity", "url": "https://api.nbp.pl/api/cenyzlota/?format=json"},

    # ───────────── Equities ─────────────
    "yahoo_chart": {
        "cat": "equity",
        "url": "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1m",
        "params": {"symbol": "AAPL"}},

    # ───────────── Crypto ─────────────
    "coingecko_price": {
        "cat": "crypto",
        "url": "https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies={vs}",
        "params": {"ids": "bitcoin", "vs": "usd"},
        "note": "per-IP throttle ~10-30/min"},
    "coinlore_tickers": {
        "cat": "crypto", "url": "https://api.coinlore.net/api/tickers/"},
    "coinbase_ticker": {
        "cat": "crypto",
        "url": "https://api.exchange.coinbase.com/products/{pair}/ticker",
        "params": {"pair": "BTC-USD"}},
    "kraken_ticker": {
        "cat": "crypto", "url": "https://api.kraken.com/0/public/Ticker?pair={pair}",
        "params": {"pair": "XBTUSD"}},
    "binance_price": {
        "cat": "crypto",
        "url": "https://api.binance.com/api/v3/ticker/price?symbol={symbol}",
        "params": {"symbol": "BTCUSDT"},
        "note": "geo-blocked on US IPs"},
    "dexscreener_token": {
        "cat": "crypto",
        "url": "https://api.dexscreener.com/latest/dex/tokens/{address}",
        "params": {"address": "So11111111111111111111111111111111111111112"}},
    "defillama_protocols": {
        "cat": "crypto", "url": "https://api.llama.fi/protocols"},

    # ───────────── Macro / Gov ─────────────
    "worldbank_indicator": {
        "cat": "macro",
        "url": ("https://api.worldbank.org/v2/country/{country}"
                "/indicator/{indicator}?format=json&per_page=5"),
        "params": {"country": "US", "indicator": "NY.GDP.MKTP.CD"}},
    "treasury_debt": {
        "cat": "macro",
        "url": ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
                "/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=1")},
    "bls_series": {
        "cat": "macro",
        "url": "https://api.bls.gov/publicAPI/v1/timeseries/data/{series}",
        "params": {"series": "LNS14000000"},
        "note": "v1 keyless, ~25 queries/day"},

    # ───────────── Filings ─────────────
    "sec_submissions": {
        "cat": "filings",
        "url": "https://data.sec.gov/submissions/CIK{cik}.json",
        "params": {"cik": "0000320193"},
        "note": "UA must contain real (non-noreply) contact email",
        "retries": 3},
}

def fetch(name: str, **overrides) -> Any:
    spec = APIS[name]
    params = {**spec.get("params", {}), **overrides}
    url = spec["url"].format(**params)
    extra_headers = spec.get("extra_headers") or {}
    attempts = spec.get("retries", 1)
    last_err = None
    for attempt in range(attempts):
        try:
            headers = {"User-Agent": UA, **extra_headers}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = r.read()
                ctype = r.headers.get("Content-Type", "")
            text = body.decode("utf-8", "replace")
            is_json = "json" in ctype
            break
        except Exception as e:
            last_err = e
            try:
                text = _via_curl(url, extra_headers)
                is_json = text.lstrip()[:1] in ("{", "[")
                break
            except Exception as e2:
                last_err = e2
                if attempt < attempts - 1:
                    time.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(f"{name}: {type(last_err).__name__}: {last_err}")
    if is_json or text.lstrip()[:1] in ("{", "["):
        return json.loads(text)
    return text

def list_apis(cats: list[str] | None = None) -> None:
    for name, spec in APIS.items():
        if cats and spec["cat"] not in cats:
            continue
        print(f"{name:24} [{spec['cat']:9}] {spec.get('note','')}")

def test_apis(cats: list[str] | None = None) -> int:
    fails = 0
    for name, spec in APIS.items():
        if cats and spec["cat"] not in cats:
            continue
        try:
            out = fetch(name)
            n = len(out) if hasattr(out, "__len__") else "?"
            print(f"  PASS  {name:24} ({n} items)")
        except Exception as e:
            fails += 1
            print(f"  FAIL  {name:24} {type(e).__name__}: {e}")
        time.sleep(0.3)
    print(f"\n{fails} failure(s) / {len(APIS)} endpoints")
    return 1 if fails else 0

if __name__ == "__main__":
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); sys.exit(0)
    cmd, rest = argv[0], argv[1:]
    cats = [c for c in rest if "=" not in c]
    if cmd in ("-l", "--list"):
        list_apis(cats or None)
    elif cmd == "get":
        name, args = rest[0], rest[1:]
        kv = dict(a.split("=", 1) for a in args if "=" in a)
        print(json.dumps(fetch(name, **kv), indent=2)[:4000])
    elif cmd == "test":
        sys.exit(test_apis(cats or None))
    else:
        print(f"unknown command: {cmd}"); sys.exit(2)
