#!/usr/bin/env python3
"""Generate report artifacts from classification data.
   Outputs:
     reports/sector_report.html       -- self-contained, open in browser
     reports/sector_report.md         -- plain markdown summary
     reports/sector_manifest.json     -- metadata + sha256 of source
     reports/sectors_by_category/*.txt -- one file per category
"""
import hashlib, json, sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

JSON_PATH = Path("config/sector_categories_ollama.json")
OUT = Path("reports")

def main():
    OUT.mkdir(exist_ok=True)
    (OUT / "sectors_by_category").mkdir(exist_ok=True)

    raw = JSON_PATH.read_bytes()
    d = json.loads(raw)
    total = len(d)
    counts = Counter(d.values())
    unknown = counts.get("other", 0) + counts.get("error", 0) + counts.get("unclassified", 0)

    # Manifest
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(JSON_PATH),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "total_sectors": total,
        "categories": dict(counts.most_common()),
        "unknown": unknown,
    }
    (OUT / "sector_manifest.json").write_text(json.dumps(manifest, indent=2))

    # Markdown
    md_lines = [
        "# Sector Classification Report",
        f"\nGenerated: `{manifest['generated_at']}`",
        f"\nTotal: **{total}** sectors across **{len(counts)}** categories",
        f"\nUnknown: **{unknown}**",
        "\n## Distribution\n",
        "| Category | Count | % |",
        "|---|---:|---:|",
    ]
    for cat, n in counts.most_common():
        md_lines.append(f"| {cat} | {n} | {n*100//total}% |")
    md_lines.append("\n## Sectors by category\n")
    for cat in sorted(counts):
        names = sorted(k for k, v in d.items() if v == cat)
        md_lines.append(f"### {cat} ({len(names)})")
        for n in names:
            md_lines.append(f"- {n}")
        md_lines.append("")
    (OUT / "sector_report.md").write_text("\n".join(md_lines))

    # Per-category files
    for cat, _ in counts.most_common():
        names = sorted(k for k, v in d.items() if v == cat)
        (OUT / "sectors_by_category" / f"{cat}.txt").write_text("\n".join(names) + "\n")

    # HTML -- embedded data, vanilla JS search
    data_json = json.dumps(d).replace("</", "<\\/")
    counts_json = json.dumps(counts.most_common())
    html = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sector Report</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:24px;color:#222;background:#fafafa}
  h1{margin:0 0 8px;font-size:22px}
  .meta{color:#666;font-size:13px;margin-bottom:20px}
  .bars{margin-bottom:24px}
  .bar{display:flex;align-items:center;margin:2px 0;font-size:13px}
  .bar-label{width:150px;color:#444}
  .bar-fill{background:#4a90e2;height:14px;border-radius:2px;min-width:1px}
  .bar-count{margin-left:8px;color:#888;font-size:12px}
  #search{padding:8px 10px;width:320px;font-size:14px;border:1px solid #ddd;border-radius:4px;margin-bottom:12px}
  .count{color:#888;font-size:12px;margin-left:10px}
  table{width:100%;border-collapse:collapse;font-size:13px;background:white;border-radius:4px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  th{text-align:left;padding:8px 10px;background:#f0f0f0;border-bottom:1px solid #e0e0e0;font-weight:600}
  td{padding:5px 10px;border-bottom:1px solid #f0f0f0}
  tr:hover{background:#f6faff}
  .cat{color:#4a90e2}
</style></head><body>
<h1>Sector Classification Report</h1>
<div class="meta" id="meta"></div>
<div class="bars" id="bars"></div>
<input type="text" id="search" placeholder="Search sectors (name or category)...">
<span class="count" id="shown"></span>
<table><thead><tr><th>Sector</th><th>Category</th></tr></thead><tbody id="rows"></tbody></table>
<script type="application/json" id="data">__DATA__</script>
<script type="application/json" id="counts">__COUNTS__</script>
<script>
  const data = JSON.parse(document.getElementById('data').textContent);
  const counts = JSON.parse(document.getElementById('counts').textContent);
  const entries = Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0]));
  const total = entries.length;
  document.getElementById('meta').textContent = total + ' sectors / ' + counts.length + ' categories';

  const maxN = counts[0][1];
  const bars = document.getElementById('bars');
  for (const [cat, n] of counts) {
    const pct = n / maxN * 100;
    const row = document.createElement('div'); row.className = 'bar';
    row.innerHTML = '<div class="bar-label">' + cat + '</div>' +
                    '<div class="bar-fill" style="width:' + pct + '%"></div>' +
                    '<div class="bar-count">' + n + '</div>';
    bars.appendChild(row);
  }

  const tbody = document.getElementById('rows');
  const shown = document.getElementById('shown');
  function render(filter) {
    const q = (filter || '').toLowerCase();
    tbody.innerHTML = '';
    let n = 0;
    for (const [sector, cat] of entries) {
      if (q && !sector.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) continue;
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + sector + '</td><td class="cat">' + cat + '</td>';
      tbody.appendChild(tr); n++;
    }
    shown.textContent = n + ' shown';
  }
  document.getElementById('search').addEventListener('input', e => render(e.target.value));
  render('');
</script></body></html>"""
    html = html.replace("__DATA__", data_json).replace("__COUNTS__", counts_json)
    (OUT / "sector_report.html").write_text(html)

    print(f"wrote: {OUT}/sector_report.html")
    print(f"wrote: {OUT}/sector_report.md")
    print(f"wrote: {OUT}/sector_manifest.json")
    print(f"wrote: {OUT}/sectors_by_category/ ({len(counts)} files)")
    print(f"\ntotal={total} categories={len(counts)} unknown={unknown}")

if __name__ == "__main__":
    main()
