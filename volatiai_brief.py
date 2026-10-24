#!/usr/bin/env python3
"""
volatiai_brief.py — fetch all sector signals in parallel; table / JSON / dashboard.

Usage:
    ./volatiai_brief.py                          # table, sorted by |pct|
    ./volatiai_brief.py --signals                # only has_signal=true
    ./volatiai_brief.py --severity warn          # only warn or critical
    ./volatiai_brief.py --group kraken           # substring filter on sector
    ./volatiai_brief.py --json > brief.json      # machine-readable
    ./volatiai_brief.py --dashboard > d.html     # self-contained viewer
    ./volatiai_brief.py --audit-history          # which sectors lack history
"""
import argparse, json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE = os.environ.get("VOLATIAI_BASE", "https://sector-slow.fourieranalys.workers.dev")
UA = os.environ.get("VOLATIAI_UA", "VolatiAI/1.0 (brief)")
TIMEOUT = int(os.environ.get("VOLATIAI_TIMEOUT", "20"))
PARALLEL = int(os.environ.get("VOLATIAI_PARALLEL", "20"))

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

def brief_one(sector):
    data = fetch_json(f"{BASE}/{sector}/signal")
    if data is None:
        return {"sector": sector, "error": "fetch_failed", "has_signal": False, "severity": "error"}
    d = data.get("delta", {})
    c = data.get("context", {})
    return {
        "sector": sector,
        "current": d.get("current"),
        "previous": d.get("previous"),
        "pct_change": d.get("pct_change"),
        "has_signal": data.get("has_signal", False),
        "severity": data.get("severity", "info"),
        "confidence": data.get("confidence", 0),
        "points": c.get("history_points", 0),
        "actual_window_days": c.get("actual_window_days"),
        "failed": data.get("sources", {}).get("failed", []),
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
    print("─" * 118)
    for r in rows:
        c, p, pct = r.get("current"), r.get("previous"), r.get("pct_change")
        cs = f"{c:>15.6g}" if isinstance(c, (int, float)) else f"{'—':>15}"
        ps = f"{p:>15.6g}" if isinstance(p, (int, float)) else f"{'—':>15}"
        pcs = f"{pct:>+8.2f}%" if isinstance(pct, (int, float)) else f"{'—':>9}"
        sev = r.get("severity", "info")
        sev_c = color(sev, {"info": "36", "warn": "1;33", "critical": "1;31", "error": "1;35"}.get(sev, "0"))
        fails = ",".join(r.get("failed", [])) or "-"
        print(f"{r['sector']:<32} {cs} {ps} {pcs} {r.get('points',0):>4} {sev_c:<8} {fails}")

def render_dashboard(rows):
    """Self-contained HTML. No server, no CORS, opens directly from disk."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    warn = sum(1 for r in rows if r.get("severity") in ("warn", "critical"))
    fail = sum(1 for r in rows if r.get("failed"))
    live = sum(1 for r in rows if r.get("points", 0) >= 2)

    def sev_class(s):
        return {"info": "i", "warn": "w", "critical": "c", "error": "e"}.get(s, "i")

    table_rows = "\n".join(
        f'<tr class="{sev_class(r.get("severity","info"))}">'
        f'<td>{r["sector"]}</td>'
        f'<td class="n">{r.get("current", "—")}</td>'
        f'<td class="n">{r.get("previous", "—")}</td>'
        f'<td class="n">{(r.get("pct_change") if isinstance(r.get("pct_change"), (int,float)) else 0):+.3f}%</td>'
        f'<td class="n">{r.get("points", 0)}</td>'
        f'<td>{r.get("severity", "info")}</td>'
        f'<td>{",".join(r.get("failed",[])) or ""}</td>'
        f'</tr>'
        for r in rows
    )
    return f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VolatiAI {ts}</title>
<style>
body{{font-family:-apple-system,system-ui,sans-serif;margin:2em;background:#0b0d10;color:#d5d7db}}
h1{{font-weight:500;margin:0 0 .5em}}
.stats{{display:flex;gap:2em;margin-bottom:1em;color:#8a8f96}}
.stats b{{color:#d5d7db;font-weight:600}}
table{{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}}
th,td{{padding:6px 10px;text-align:left;border-bottom:1px solid #1c2028}}
th{{position:sticky;top:0;background:#0b0d10;font-weight:500;color:#8a8f96;cursor:pointer;user-select:none}}
td.n{{text-align:right;font-family:ui-monospace,Menlo,monospace}}
tr.i td:first-child{{border-left:3px solid #2c3140}}
tr.w td:first-child{{border-left:3px solid #d4a017}}
tr.c td:first-child{{border-left:3px solid #d23b3b;background:#1a0f0f}}
tr.e td:first-child{{border-left:3px solid #7a3bd2;background:#120b1a}}
tr:hover td{{background:#141820}}
tr.c:hover td,tr.e:hover td{{background:#231318}}
</style></head><body>
<h1>VolatiAI · {ts}</h1>
<div class="stats">
  <span><b>{len(rows)}</b> sectors</span>
  <span><b>{live}</b> with history</span>
  <span><b>{warn}</b> warn/critical</span>
  <span><b>{fail}</b> with failed sources</span>
</div>
<table id="t"><thead><tr>
<th onclick="sort(0)">sector</th><th onclick="sort(1)">current</th>
<th onclick="sort(2)">prev</th><th onclick="sort(3)">pct</th>
<th onclick="sort(4)">pts</th><th onclick="sort(5)">sev</th><th>failed</th>
</tr></thead><tbody>{table_rows}</tbody></table>
<script>
let dir={{}};
function sort(c){{
  const t=document.getElementById('t').tBodies[0];
  const rows=[...t.rows];
  dir[c]=!dir[c];
  rows.sort((a,b)=>{{
    const av=a.cells[c].textContent, bv=b.cells[c].textContent;
    const an=parseFloat(av.replace('%','')), bn=parseFloat(bv.replace('%',''));
    if(!isNaN(an)&&!isNaN(bn)) return dir[c]?an-bn:bn-an;
    return dir[c]?av.localeCompare(bv):bv.localeCompare(av);
  }});
  rows.forEach(r=>t.appendChild(r));
}}
</script></body></html>'''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--signals", action="store_true")
    ap.add_argument("--severity", default=None)
    ap.add_argument("--group", default=None)
    ap.add_argument("--sector", default=None)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--dashboard", action="store_true")
    ap.add_argument("--audit-history", action="store_true")
    ap.add_argument("--no-color", action="store_true")
    args = ap.parse_args()

    sectors = [args.sector] if args.sector else load_sectors()
    if args.group:
        sectors = [s for s in sectors if args.group in s]
    if not sectors:
        sys.exit("no sectors")

    print(f"fetching {len(sectors)} sectors with {PARALLEL} workers...", file=sys.stderr)
    rows = []
    with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
        futures = {ex.submit(brief_one, s): s for s in sectors}
        for fut in as_completed(futures):
            rows.append(fut.result())

    if args.audit_history:
        need = sorted([r for r in rows if r.get("points", 0) < 5], key=lambda r: r.get("points", 0))
        print(f"{len(need)} sectors with <5 history points:")
        for r in need:
            print(f"  {r['sector']:<32} pts={r.get('points',0):<3} failed={','.join(r.get('failed',[])) or '-'}")
        return

    if args.severity:
        min_rank = sev_rank(args.severity)
        rows = [r for r in rows if sev_rank(r.get("severity", "info")) >= min_rank]
    if args.signals:
        rows = [r for r in rows if r.get("has_signal")]
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
    print(f"\n{len(rows)} shown / {len(sectors)} total   ·   "
          f"{color(f'{warn} warn+', '1;33') if warn else '0 warn+'}   ·   "
          f"{failed} with failed sources")

if __name__ == "__main__":
    main()
