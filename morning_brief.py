#!/usr/bin/env python3
"""Read last 24h of signal_history, ask local Qwen to write a brief."""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HISTORY = ROOT / "reports" / "signal_history.jsonl"
OUT_MD = ROOT / "reports" / "brief.md"
OUT_HTML = ROOT / "reports" / "brief.html"

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "qwen2.5:7b"
WINDOW_HOURS = 24


def load_recent():
    if not HISTORY.exists():
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)).timestamp()
    events = []
    for line in HISTORY.read_text().splitlines():
        if not line.strip():
            continue
        try:
            e = json.loads(line)
            ts = datetime.fromisoformat(e["ts"].replace("Z", "+00:00")).timestamp()
            if ts < cutoff:
                continue
            if e.get("summary", "").lower() == "quiet":
                continue
            events.append(e)
        except Exception:
            continue
    events.sort(key=lambda x: x["ts"], reverse=True)
    return events


def build_prompt(events):
    lines = []
    for e in events:
        line = f"[{e['ts'][11:16]}] {e['sector']}: {e['summary']}"
        if e.get("link"):
            line += f" ({e['link']})"
        lines.append(line)
    block = "\n".join(lines)
    return f"""You are a terse market analyst. Below are {len(events)} signals from the last {WINDOW_HOURS} hours.

Format: [time] sector: summary (link)

{block}

Produce exactly these sections:

## What happened
List 1-3 of the most consequential signals. Format each as a single sentence:
"[sector] reported [specific fact from the signal]."

Do NOT interpret. Do NOT add context not in the signal. If the signal says "13F filed by X", write "X filed a 13F." Do not write "suggesting shifts in Y" or "indicating interest in Z."

## Correlations
Only write this if two or more signals reference the SAME specific entity, event, or number. If no such overlap exists, write exactly: "No correlations detected."
Do NOT claim a "broader trend" from unrelated signals firing in the same window.

## What to watch
One sentence. Based on ONE specific signal, name a specific thing that would confirm or contradict it.

Rules:
- Be terse. Delete any sentence containing: significant, notable, interesting, suggesting, indicating, reflecting, potential, broader trend.
- Exclude noise (games, generic PR, single job postings) and list them under "## Excluded".
- Do not invent details. If you don't know what's in a 13F, don't guess.
- If nothing is consequential, write "Quiet day — no consequential signals." and stop.
"""


def call_llm(prompt):
    import requests
    r = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": 0.0, "num_predict": 1024, "num_ctx": 8192},
    }, timeout=120)
    r.raise_for_status()
    return r.json()["message"]["content"].strip()


def md_to_html(md):
    import re
    out = []
    in_list = False
    for line in md.split("\n"):
        h = re.match(r"^##\s+(.+)$", line)
        if h:
            if in_list: out.append("</ul>"); in_list = False
            out.append(f"<h2>{h.group(1)}</h2>")
            continue
        li = re.match(r"^[-*]\s+(.+)$", line)
        if li:
            if not in_list: out.append("<ul>"); in_list = True
            out.append(f"<li>{inline(li.group(1))}</li>")
            continue
        if not line.strip():
            if in_list: out.append("</ul>"); in_list = False
            continue
        if in_list: out.append("</ul>"); in_list = False
        out.append(f"<p>{inline(line)}</p>")
    if in_list: out.append("</ul>")
    return "\n".join(out)


def inline(text):
    import re
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"(?<![=\"])(https?://[^\s<]+)", r'<a href="\1">\1</a>', text)
    return text


def render_html(body, when, n):
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VolatiAI Morning Brief</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222;background:#fafafa;line-height:1.65}}
h1{{font-size:26px;margin:0 0 6px;letter-spacing:-0.02em}}
.meta{{color:#888;font-size:13px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #e8e8e8}}
h2{{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#555;margin:32px 0 10px;font-weight:600}}
p{{margin:0 0 16px}}
ul{{margin:0 0 16px;padding-left:22px}}
li{{margin:0 0 6px}}
a{{color:#4a90e2;text-decoration:none}}
a:hover{{text-decoration:underline}}
</style></head><body>
<h1>Morning Brief</h1>
<div class="meta">{when} &middot; {n} signal(s) in the last {WINDOW_HOURS}h</div>
{md_to_html(body)}
</body></html>"""


def main():
    events = load_recent()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if not events:
        body = "No signals in the last 24 hours. The fleet is quiet."
        OUT_MD.write_text(f"# Morning Brief\n\n_{now}_\n\n{body}\n")
        OUT_HTML.write_text(render_html(body, now, 0))
        print(f"no signals in last {WINDOW_HOURS}h")
        return 0

    print(f"found {len(events)} signal(s) in last {WINDOW_HOURS}h")
    print(f"calling {MODEL}...")
    body = call_llm(build_prompt(events))
    OUT_MD.write_text(f"# Morning Brief\n\n_{now}_\n\n{body}\n")
    OUT_HTML.write_text(render_html(body, now, len(events)))
    print(f"wrote: {OUT_MD}")
    print(f"wrote: {OUT_HTML}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
