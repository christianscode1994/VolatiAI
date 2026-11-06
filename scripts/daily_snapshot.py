#!/usr/bin/env python3
"""Daily sector snapshot + silent-failure monitor (curl-based)."""
import argparse
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

WORKERS = {
    "sector-slow": "https://sector-slow.fourieranalys.workers.dev",
    "sector-dense": "https://sector-dense.fourieranalys.workers.dev",
    "sector-sparse": "https://sector-sparse.fourieranalys.workers.dev",
}
TIMEOUT = 30
CONCURRENCY = 1
SNAPSHOT_DIR = Path("docs/snapshots")
import re


def build_sector_map():
    """Map every sector to its hosting worker by scanning source files."""
    m = {}
    for wname in WORKERS:
        p = Path(f"workers/{wname}/src/index.js")
        if p.exists():
            for b in re.findall(r'^  "?([a-z0-9-]+)"?: \{', p.read_text(), re.MULTILINE):
                m[b] = wname
    return m


SECTOR_MAP = build_sector_map()


def fetch_signal(sector, worker="sector-slow"):
    url = f"{WORKERS[worker]}/{sector}/signal"
    try:
        r = subprocess.run(
            ["curl", "-sL", "-w", "\n%{http_code}", "--max-time", str(TIMEOUT),
             "-A", "VolatiAI-snapshot/1.0", url],
            capture_output=True, text=True, timeout=TIMEOUT + 5,
        )
        if r.returncode != 0:
            return {"ok": False, "current": None, "failed": [f"curl_{r.returncode}"]}
        lines = r.stdout.rsplit("\n", 1)
        if len(lines) != 2:
            return {"ok": False, "current": None, "failed": ["bad_output"]}
        body, status = lines
        if status.strip() != "200":
            return {"ok": False, "current": None, "failed": [f"http_{status.strip()}"]}
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return {"ok": False, "current": None, "failed": ["bad_json"]}
        cur = (data.get("delta") or {}).get("current")
        failed = (data.get("sources") or {}).get("failed", [])
        return {"ok": cur is not None and len(failed) == 0,
                "current": cur, "failed": failed}
    except subprocess.TimeoutExpired:
        return {"ok": False, "current": None, "failed": ["timeout"]}
    except Exception as e:
        return {"ok": False, "current": None, "failed": [f"err_{type(e).__name__}"]}


def load_previous(today):
    if not SNAPSHOT_DIR.exists():
        return None
    for path in sorted(SNAPSHOT_DIR.glob("*.json"), reverse=True):
        if path.stem != today:
            with open(path) as f:
                return json.load(f)
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    with open("config/active_sectors.json") as f:
        sectors = json.load(f)

    print(f"Fetching {len(sectors)} sectors across {len(WORKERS)} workers")
    results = {}
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = {}
        for i, s in enumerate(sectors):
            worker = SECTOR_MAP.get(s, "sector-slow")
            futures[ex.submit(fetch_signal, s, worker)] = s
            if (i + 1) % CONCURRENCY == 0:
                time.sleep(1.0)
        for i, fut in enumerate(as_completed(futures), 1):
            sector = futures[fut]
            try:
                results[sector] = fut.result()
            except Exception as e:
                results[sector] = {"ok": False, "current": None,
                                   "failed": [f"fetch_{type(e).__name__}"]}
            if i % 50 == 0:
                print(f"  {i}/{len(sectors)}")

    ok = sum(1 for r in results.values() if r["ok"])
    fail = len(results) - ok
    print(f"Snapshot: {ok} ok, {fail} failed")

    if fail > len(sectors) * 0.9:
        print(f"❌ {fail}/{len(sectors)} failed")
        for name, r in list(results.items())[:3]:
            print(f"   sample {name}: {r}")
        return 2

    if not args.dry_run:
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        out = SNAPSHOT_DIR / f"{today}.json"
        with open(out, "w") as f:
            json.dump({"ts": ts, "total": len(sectors), "ok": ok,
                       "failed": fail, "sectors": results}, f, indent=2)
        print(f"Wrote {out}")

    prev = load_previous(today)
    if prev is None:
        print("No previous snapshot — baseline established.")
        return 0

    prev_s = prev.get("sectors", {})
    reg, rec, new, gone = [], [], [], []
    for sector, td in results.items():
        if sector not in prev_s:
            new.append(sector); continue
        pd = prev_s[sector]
        if pd.get("ok") and not td["ok"]:
            reg.append((sector, pd, td))
        elif not pd.get("ok") and td["ok"]:
            rec.append((sector, pd, td))
    for sector in prev_s:
        if sector not in results:
            gone.append(sector)

    print(f"\n=== DIFF vs {prev.get('ts', '?')} ===")
    if reg:
        print(f"\n🔴 REGRESSIONS ({len(reg)}):")
        for n, pp, tt in reg:
            print(f"  - {n}: {pp.get('current')} → null (failed: {tt.get('failed')})")
    if rec:
        print(f"\n🟢 RECOVERIES ({len(rec)}):")
        for n, pp, tt in rec:
            print(f"  - {n}: now {tt.get('current')}")
    if new:
        print(f"\n🆕 NEW ({len(new)}):")
        for n in new:
            print(f"  - {n}")
    if gone:
        print(f"\n⚠️  DISAPPEARED ({len(gone)}):")
        for n in gone:
            print(f"  - {n}")
    if not (reg or rec or new or gone):
        print("No changes.")

    return 1 if reg else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(2)
