#!/usr/bin/env python3
"""Fetch every worker's signal, produce reports/signals.md + signals.html."""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUBDOMAIN = "fourieranalys.workers.dev"
TIMEOUT = 10

# Aggregate/infra workers don't have the /signal shape — skip them
SKIP = {
    "sector-slow", "sector-sparse", "sector-dense",
    "interop-messaging", "protocols-tvl", "scaling-l2",
    "web3-identity",
}

def discover_workers():
    out = []
    wdir = ROOT / "workers"
    if not wdir.exists():
        return out
    for d in sorted(wdir.iterdir()):
        if not d.is_dir():
            continue
        wr = d / "wrangler.toml"
        if not wr.exists():
            continue
        text = wr.read_text(errors="ignore")
        m = re.search(r'^name\s*=\s*"([^"]+)"', text, re.M)
        if m:
            out.append(m.group(1))
    return out

def curl_signal(name):
    url = f"https://{name}.{SUBDOMAIN}/signal"
    try:
        r = subprocess.run(
            ["curl", "-sS", "-m", str(TIMEOUT), url],
            capture_output=True, timeout=TIMEOUT + 5,
        )
        if r.returncode != 0 or not r.stdout:
            return None
        return json.loads(r.stdout)
    except Exception:
        return None

def load_categories():
    p = ROOT / "config" / "sector_categories_ollama.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text())

def sector_from_worker(worker_name):
    return worker_name[len("sector-"):] if worker_name.startswith("sector-") else worker_name

def main():
    workers = [w for w in discover_workers() if w not in SKIP]
    if not workers:
        print("no sector workers found", file=sys.stderr)
        return 1

    categories = load_categories()
    signals = []

    for name in workers:
        data = curl_signal(name)
        if not data:
            continue
        has = bool(data.get("has_signal"))
        summary = (data.get("summary") or "").strip()
        ctx = data.get("context") or {}
        link = ctx.get("link") or ""
        updated = ctx.get("updated") or data.get("timestamp") or ""
        sector = data.get("sector") or sector_from_worker(name)

        # Skip if quiet and no meaningful content
        if not has and summary.lower() in ("quiet", ""):
            continue

        signals.append({
            "worker": name,
            "sector": sector,
            "category": categories.get(sector, "unknown"),
            "has_signal": has,
            "summary": summary,
            "link": link,
            "updated": updated,
        })

    by_cat = {}
    for s in signals:
        by_cat.setdefault(s["category"], []).append(s)

    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── markdown ──
    md = [f"# VolatiAI Signal Digest\n", f"_Generated {now}_\n"]
    if not signals:
        md.append("**No active signals** across the fleet.\n")
    else:
        md.append(f"**{len(signals)} signal(s)** across **{len(by_cat)}** categor{'y' if len(by_cat)==1 else 'ies'}**\n")
        for cat in sorted(by_cat):
            items = sorted(by_cat[cat], key=lambda x: (not x["has_signal"], x["sector"]))
            md.append(f"\n## {cat.title()} ({len(items)})\n")
            for s in items:
                flag = "🔔" if s["has_signal"] else "·"
                md.append(f"- {flag} **{s['sector']}** — {s['summary']}")
                if s["link"]:
                    md.append(f"  {s['link']}")
                if s["updated"]:
                    md.append(f"  _Updated: {s['updated']}_")

    (out / "signals.md").write_text("\n".join(md) + "\n")

    # ── html ──
    rows = []
    for s in sorted(signals, key=lambda x: (not x["has_signal"], x["category"], x["sector"])):
        flag = "🔔" if s["has_signal"] else ""
        link_html = f'<a href="{s["link"]}" target="_blank" rel="noopener">→</a>' if s["link"] else ""
        rows.append(
            f"<tr><td>{flag}</td>"
            f"<td><code>{s['category']}</code></td>"
            f"<td><strong>{s['sector']}</strong></td>"
            f"<td>{s['summary']}</td>"
            f"<td>{link_html}</td>"
            f"<td><small>{s['updated']}</small></td></tr>"
        )

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VolatiAI Signals</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:24px;background:#fafafa;color:#222}}
h1{{margin:0 0 6px;font-size:22px}}
.meta{{color:#888;font-size:13px;margin-bottom:20px}}
table{{width:100%;border-collapse:collapse;background:white;box-shadow:0 1px 2px rgba(0,0,0,.05);border-radius:6px;overflow:hidden}}
th{{text-align:left;padding:10px;background:#f0f0f0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#666;border-bottom:1px solid #ddd}}
td{{padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;vertical-align:top}}
td:first-child{{width:26px;text-align:center}}
code{{background:#eef4fc;color:#036;padding:2px 6px;border-radius:3px;font-size:11px}}
a{{color:#4a90e2;text-decoration:none;font-weight:600}}
tr:hover{{background:#f6faff}}
.empty{{text-align:center;padding:48px;color:#888}}
</style></head><body>
<h1>VolatiAI Signals</h1>
<div class="meta">{now} &middot; {len(signals)} signal(s) across {len(by_cat)} categor{'y' if len(by_cat)==1 else 'ies'}</div>
<table><thead><tr><th></th><th>Category</th><th>Sector</th><th>Summary</th><th></th><th>Updated</th></tr></thead>
<tbody>{''.join(rows) if rows else '<tr><td colspan="6" class="empty">No active signals. The fleet is quiet.</td></tr>'}</tbody></table>
</body></html>"""
    (out / "signals.html").write_text(html)

    print(f"wrote: {out / 'signals.md'}")
    print(f"wrote: {out / 'signals.html'}")
    print(f"\n{len(signals)} signal(s) across {len(by_cat)} categor{'y' if len(by_cat)==1 else 'ies'}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
