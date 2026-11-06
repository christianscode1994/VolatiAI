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
List 1-3 of the most consequential signals. Format each as a single sentence of the form:
"[sector] reported [specific fact from the signal]."

Do NOT interpret. Do NOT add context not in the signal.
If the signal says "13F filed by X", write "X filed a 13F." Do not write "suggesting shifts in Y" or "indicating interest in Z."

## Correlations
Only write this section if two or more signals reference the SAME specific entity, event, or number (e.g., the same fund, the same company, the same deal value).
If no such overlap exists, write exactly: "No correlations detected."
Do NOT claim a "broader trend" from unrelated signals firing in the same window. Three sectors firing independently is not a trend.

## What to watch
One sentence. Based on ONE specific signal above, name a specific thing that would confirm or contradict it. Example: "Watch for a follow-up 13F from the same fund in the next 72 hours." Not "monitor for additional filings."

Rules:
- Be terse. If you're about to write "significant", "notable", "interesting", "suggesting", "indicating", "reflecting", or "potential", delete the sentence.
- If a signal is noise (games, generic PR, single job postings), exclude it and list it under "## Excluded".
- Do not invent details. If you don't know what's in a 13F, don't guess.
- If nothing is genuinely consequential, write "Quiet day — no consequential signals." and stop.
"""
