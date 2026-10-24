#!/usr/bin/env python3
"""volatiai_brief.py — fetch all sector signals; table / JSON / dashboard / cached."""
import argparse, json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")

def _load_provenance():
    try:
        with open("config/provenance.json") as f:
            return json.load(f)
    except Exception:
        return {}
PROVENANCE = _load_provenance()
UA = os.environ.get("VOLATIAI_UA", "VolatiAI/1.0 (brief)")
TIMEOUT = int(os.environ.get("VOLATIAI_TIMEOUT", "20"))
PARALLEL = int(os.environ.get("VOLATIAI_PARALLEL", "20"))

# Composite signals — evaluated against the /latest snapshot
COMPOSITE_RULES = [
    # ─── Crypto (Kraken + Coinbase, redistribution-safe) ───
    ("crypto-crash", "3+ crypto down >5%",
     lambda b: sum(1 for k in ["kraken-btc-usd","kraken-eth-usd","kraken-sol-usd",
                                "coinbase-btc-usd","coinbase-eth-usd"]
                   if (b.get(k) or {}).get("pct_change", 0) < -5) >= 3),
    ("crypto-meltup", "3+ crypto up >5%",
     lambda b: sum(1 for k in ["kraken-btc-usd","kraken-eth-usd","kraken-sol-usd",
                                "coinbase-btc-usd","coinbase-eth-usd"]
                   if (b.get(k) or {}).get("pct_change", 0) > 5) >= 3),
    ("btc-exchange-divergence", "Kraken vs Coinbase BTC spread >0.5%",
     lambda b: abs((b.get("btc-exchange-spread") or {}).get("current", 0) or 0) > 0.5),
    ("eth-exchange-divergence", "Kraken vs Coinbase ETH spread >0.5%",
     lambda b: abs((b.get("eth-exchange-spread") or {}).get("current", 0) or 0) > 0.5),
    ("crypto-volume-burst", "Coinbase BTC 24h volume +50%",
     lambda b: (b.get("coinbase-btc-volume24h") or {}).get("pct_change", 0) > 50),
    # ─── Macro ───
    ("yield-spike", "US 10Y yield up >5%",
     lambda b: (b.get("fred-dgs10") or {}).get("pct_change", 0) > 5),
    ("yield-collapse", "US 10Y yield down >5%",
     lambda b: (b.get("fred-dgs10") or {}).get("pct_change", 0) < -5),
    ("debt-alarm", "US debt/GDP > 130%",
     lambda b: (b.get("dbnomics-us-debt") or {}).get("current", 0) > 130),
    ("unemployment-regime", "US unemployment crosses 4.5%",
     lambda b: (b.get("worldbank-us-unemployment") or {}).get("current", 0) > 4.5),
    # ─── FX ───
    ("eur-stress", "EUR/USD down >2%",
     lambda b: (b.get("frankfurter-eurusd") or {}).get("pct_change", 0) < -2),
    ("sek-stress", "EUR/SEK up >2%",
     lambda b: (b.get("frankfurter-eursek") or {}).get("pct_change", 0) > 2),
    # ─── Commodity ───
    ("gold-strength", "Gold up >2% in PLN",
     lambda b: (b.get("nbp-gold-spot") or {}).get("pct_change", 0) > 2),
    ("gold-weakness", "Gold down >2% in PLN",
     lambda b: (b.get("nbp-gold-spot") or {}).get("pct_change", 0) < -2),
    # ─── Cross-domain ───
    ("gold-crypto-divergence", "Gold up >1% AND BTC down >3%",
     lambda b: (b.get("nbp-gold-spot") or {}).get("pct_change", 0) > 1
               and (b.get("kraken-btc-usd") or {}).get("pct_change", 0) < -3),
    ("crypto-macro-rally", "BTC up >3% AND 10Y yield down >2%",
     lambda b: (b.get("kraken-btc-usd") or {}).get("pct_change", 0) > 3
               and (b.get("fred-dgs10") or {}).get("pct_change", 0) < -2),
    # ─── DeFi ───
    ("stablecoin-flight", "Total stablecoin supply down >3%",
     lambda b: (b.get("stablecoin-total-supply") or {}).get("pct_change", 0) < -3),
    ("stablecoin-inflow", "Total stablecoin supply up >3%",
     lambda b: (b.get("stablecoin-total-supply") or {}).get("pct_change", 0) > 3),
    ("dex-volume-burst", "Total DEX volume +50%",
     lambda b: (b.get("dex-total-volume-24h") or {}).get("pct_change", 0) > 50),
    ("tvl-crash", "DeFi total TVL down >5%",
     lambda b: (b.get("defi-total-tvl") or {}).get("pct_change", 0) < -5),
    ("nft-crash", "BAYC floor down >10%",
     lambda b: (b.get("nft-bayc-floor") or {}).get("pct_change", 0) < -10),
    ("defi-expansion", "DeFi protocol count +0.5%",
     lambda b: (b.get("defillama-protocol-count") or {}).get("pct_change", 0) > 0.5),
]

def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={"user-agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except Exception:
        out = subprocess.run(
            ["curl", "-sfL", "--max-time", str(TIMEOUT), "-A", UA, url],
            capture_output=True, text=True)
        if out.returncode != 0:
            return None
        try:
            return json.loads(out.stdout)
        except Exception:
            return None

def fetch_latest():
    data = fetch_json(f"{BASE}/latest")
    if not data or "rows" not in data:
        return None
    out = []
    for r in data["rows"]:
        sector = r.get("sector")
        cat = "other"
        try:
            for c, members in (CATEGORIES or {}).items():
                if isinstance(members, list) and sector in members:
                    cat = c
                    break
        except Exception:
            pass
        prov = (PROVENANCE or {}).get(sector) or {}
        out.append({
            "sector": sector,
            "category": cat,
            "provider": prov.get("provider"),
            "source_url": prov.get("url"),
            "license": prov.get("license"),
            "current": r.get("current"),
            "previous": r.get("previous"),
            "pct_change": r.get("pct_change"),
            "has_signal": r.get("has_signal", False),
            "severity": r.get("severity", "info"),
            "confidence": r.get("confidence", 0),
            "points": r.get("pts", r.get("points", 0)),
            "failed": r.get("failed", []),
        })
    return out

def brief_one(sector):
    data = fetch_json(f"{BASE}/{sector}/signal")
    if data is None:
        return {"sector": sector, "error": "fetch_failed", "has_signal": False,
                "severity": "error", "points": 0, "failed": []}
    d = data.get("delta", {}) or {}
    c = data.get("context", {}) or {}
    prov = PROVENANCE.get(sector, {})
    cat = next((c for c, members in CATEGORIES.items() if sector in members), "other")
    return {
        "sector": sector,
        "category": cat,
        "provider": prov.get("provider"),
        "source_url": prov.get("url"),
        "license": prov.get("license"),
        "current": d.get("current"),
        "previous": d.get("previous"),
        "pct_change": d.get("pct_change"),
        "has_signal": data.get("has_signal", False),
        "severity": data.get("severity", "info"),
        "confidence": data.get("confidence", 0),
        "points": c.get("history_points", 0),
        "actual_window_days": c.get("actual_window_days"),
        "failed": (data.get("sources") or {}).get("failed", []),
    }

def load_sectors():
    p = Path("config/active_sectors.json")
    if not p.exists():
        sys.exit("config/active_sectors.json not found — run from ~/VolatiAI")
    return json.loads(p.read_text())

def sev_rank(s):
    return {"info": 0, "warn": 1, "critical": 2, "error": 3}.get(s, 0)

def render_table(rows, color):
    print(f"{'sector':<32} {'current':>15} {'prev':>15} {'pct':>9} {'pts':>4} {'sev':<8} {'failed'}")
    print("-" * 118)
    for r in rows:
        c, p, pct = r.get("current"), r.get("previous"), r.get("pct_change")
        cs = f"{c:>15.6g}" if isinstance(c, (int, float)) else f"{'—':>15}"
        ps = f"{p:>15.6g}" if isinstance(p, (int, float)) else f"{'—':>15}"
        pcs = f"{pct:>+8.2f}%" if isinstance(pct, (int, float)) else f"{'—':>9}"
        sev = r.get("severity", "info")
        sev_c = color(sev, {"info": "36", "warn": "1;33", "critical": "1;31", "error": "1;35"}.get(sev, "0"))
        fails = ",".join(r.get("failed", []) or []) or "-"
        print(f"{r['sector']:<32} {cs} {ps} {pcs} {r.get('points', 0):>4} {sev_c:<8} {fails}")

def render_dashboard(rows):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    warn = sum(1 for r in rows if r.get("severity") in ("warn", "critical"))
    fail = sum(1 for r in rows if r.get("failed"))
    live = sum(1 for r in rows if r.get("points", 0) >= 2)
    def sev_class(s):
        return {"info": "i", "warn": "w", "critical": "c", "error": "e"}.get(s, "i")
    trs = []
    for r in rows:
        pct = r.get("pct_change")
        pct_s = f"{pct:+.3f}%" if isinstance(pct, (int, float)) else "—"
        trs.append(
            f'<tr class="{sev_class(r.get("severity","info"))}">'
            f'<td>{r["sector"]}</td>'
            f'<td class="n">{r.get("current", "—")}</td>'
            f'<td class="n">{r.get("previous", "—")}</td>'
            f'<td class="n">{pct_s}</td>'
            f'<td class="n">{r.get("points", 0)}</td>'
            f'<td>{r.get("severity", "info")}</td>'
            f'<td>{",".join(r.get("failed",[]) or [])}</td>'
            f'</tr>')
    return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>VolatiAI " + ts + "</title></head><body>" \
        + "<h1>VolatiAI " + ts + "</h1>" \
        + "<p>" + str(len(rows)) + " sectors · " + str(live) + " with history · " + str(warn) + " warn+ · " + str(fail) + " failed sources</p>" \
        + "<table border=1 cellpadding=4><thead><tr><th>sector</th><th>current</th><th>prev</th><th>pct</th><th>pts</th><th>sev</th><th>failed</th></tr></thead><tbody>" \
        + "".join(trs) + "</tbody></table></body></html>"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cached", action="store_true")
    ap.add_argument("--signals", action="store_true")
    ap.add_argument("--severity", default=None)
    ap.add_argument("--group", default=None)
    ap.add_argument("--sector", default=None)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--dashboard", action="store_true")
    ap.add_argument("--audit-history", action="store_true")
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--metrics", action="store_true",
                    help="show pipeline health from /metrics")
    ap.add_argument("--category", default=None,
                    help="filter by category (crypto|macro|fx|commodity|defi)")
    ap.add_argument("--composite", action="store_true",
                    help="show composite signal evaluation against /latest")
    args = ap.parse_args()

    if args.metrics:
        m = fetch_json(f"{BASE}/metrics")
        if m is None:
            sys.exit("/metrics unreachable")
        print(f"Pipeline health · {m.get('ts')}")
        print("-" * 40)
        print(f"  tracked:          {m.get('tracked_sectors', 0)}")
        print(f"  healthy:          {m.get('healthy', 0)}")
        print(f"  failing now:      {m.get('failing_now', 0)}")
        print(f"  failing <24h:     {m.get('failing_within_24h', 0)}")
        print(f"  failing >24h:     {m.get('failing_over_24h', 0)}")
        fails = m.get("failing_sectors", [])
        if fails:
            print("\nfailing sectors:")
            for f in fails[:10]:
                print(f"  {f['sector']:<30} {f.get('error') or '?'}")
        return


    sectors = [args.sector] if args.sector else load_sectors()
    if args.group:
        sectors = [s for s in sectors if args.group in s]
    if not sectors:
        sys.exit("no sectors")

    if args.cached:
        print("fetching /latest (cached)...", file=sys.stderr)
        cached = fetch_latest()
        if cached is None:
            sys.exit("/latest failed — deploy the worker first, or omit --cached")
        if args.group:
            cached = [r for r in cached if args.group in r["sector"]]
        if args.sector:
            cached = [r for r in cached if r["sector"] == args.sector]
        rows = cached
    else:
        print(f"fetching {len(sectors)} sectors with {PARALLEL} workers...", file=sys.stderr)
        rows = []
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            futures = {ex.submit(brief_one, s): s for s in sectors}
            for fut in as_completed(futures):
                rows.append(fut.result())


    if args.composite:
        by_sector = {r["sector"]: r for r in rows}
        print(f"{'signal':<24} {'status':<8} rule")
        print("-" * 80)
        fired = []
        for name, desc, rule in COMPOSITE_RULES:
            try:
                active = rule(by_sector)
            except Exception:
                active = False
            status = "\033[1;31mFIRING\033[0m" if active else "quiet"
            print(f"{name:<24} {status:<8} {desc}")
            if active:
                fired.append(name)
        print()
        print(f"{len(fired)} composite signal(s) firing")
        return

    if args.audit_history:
        need = sorted([r for r in rows if r.get("points", 0) < 5], key=lambda r: r.get("points", 0))
        print(f"{len(need)} sectors with <5 history points:")
        for r in need[:40]:
            print(f"  {r['sector']:<32} pts={r.get('points',0):<3} failed={','.join(r.get('failed',[]) or []) or '-'}")
        return

    if args.severity:
        rows = [r for r in rows if sev_rank(r.get("severity", "info")) >= sev_rank(args.severity)]
    if args.signals:
        rows = [r for r in rows if r.get("has_signal")]
    if args.category:
        rows = [r for r in rows if r.get("category") == args.category]
    rows.sort(key=lambda r: abs(r.get("pct_change") or 0), reverse=True)

    if args.dashboard:
        print(render_dashboard(rows))
        return
    if args.json:
        print(json.dumps(rows, indent=2, default=str))
        return

    use_color = sys.stdout.isatty() and not args.no_color
    color = lambda s, c: f"\033[{c}m{s}\033[0m" if use_color else s
    render_table(rows, color)

    warn = sum(1 for r in rows if r.get("severity") in ("warn", "critical"))
    failed = sum(1 for r in rows if r.get("failed"))
    print(f"\n{len(rows)} shown / {len(sectors)} total   ·   {warn} warn+   ·   {failed} with failed sources")

if __name__ == "__main__":
    main()
