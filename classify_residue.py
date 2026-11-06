#!/usr/bin/env python3
"""Classify leftover sectors: PREFIX -> EXACT -> Ollama cascade."""
import json, re, sys
from pathlib import Path
from collections import Counter

JSON_PATH = Path("config/sector_categories_ollama.json")
ENDPOINT  = "http://127.0.0.1:11434/api/chat"
MODEL_CASCADE = ["qwen2.5:7b", "llama3.1:8b"]

CATS = [
    "developer","macro","crypto","environment","commerce","security",
    "defi","health","ai","dex","sports","science","jobs","infrastructure",
    "fx","commodity","stablecoin","nft","demographics","energy","legal",
    "media","research","geography","transport","knowledge","politics",
    "misc","unclassified",
]

PREFIX = {
    "crates-":"developer","npm-":"developer","pypi-":"developer",
    "nuget-":"developer","cpan-":"developer","cran-":"developer",
    "clearlydefined":"developer","benchgecko":"developer",
    "cloud-":"infrastructure","cloudflare":"infrastructure",
    "box-status":"infrastructure","bgp-":"infrastructure","data-validity":"infrastructure",
    "crossref":"research","doaj":"research","datacite":"research",
    "ensembl":"science","bfs-swiss":"science","chemistry":"science",
    "biology":"science","biotech":"science","compute":"science",
    "faa":"transport","adsb-":"transport","aviation-":"transport",
    "bart-":"transport","bike-share":"transport","digitraffic":"transport",
    "cbp-":"transport",
    "gleif":"macro","13f-":"macro","brreg-":"macro",
    "usgs":"environment","nasa":"environment","7timer":"environment",
    "baltic-":"environment","critical-materials":"commodity",
    "wikipedia":"knowledge","api-directory":"knowledge","apis-guru":"knowledge",
    "books":"knowledge","anime":"media","art-":"media","cleveland-art":"media",
    "beauty":"media","bluesky":"media",
    "ballotwatch":"legal","disclosure-archives":"legal",
    "agent-census":"ai","autonomous-tech":"ai",
    "china":"geography",
}

EXACT_PATH = Path("config/sector_exact.json")
EXACT = json.loads(EXACT_PATH.read_text()) if EXACT_PATH.exists() else {}

def by_prefix(s):
    s = s.lower()
    for k, v in PREFIX.items():
        if s.startswith(k):
            return v
    return None

def normalize_labels(raw, names):
    if isinstance(raw, dict):
        if raw and all(isinstance(v, str) for v in raw.values()):
            return {k: v for k, v in raw.items() if k in names}
        for v in raw.values():
            if isinstance(v, dict) and v and all(isinstance(c, str) for c in v.values()):
                return {k: c for k, c in v.items() if k in names}
        if "sector" in raw and "category" in raw:
            return {raw["sector"]: raw["category"]}
    if isinstance(raw, list):
        out = {}
        for item in raw:
            if isinstance(item, dict):
                n = item.get("sector") or item.get("name")
                c = item.get("category") or item.get("cat")
                if n and c:
                    out[n] = c
        return {k: v for k, v in out.items() if k in names}
    return {}

def build_prompt(names):
    ex_names = ["spotify-api", "uniswap-pools", "fred-economic-data"]
    ex_map = {"spotify-api": "media",
              "uniswap-pools": "defi",
              "fred-economic-data": "macro"}
    parts = []
    parts.append("You are a JSON-only API sector classifier.")
    parts.append("")
    parts.append("Valid categories: " + ", ".join(CATS))
    parts.append("")
    parts.append("Examples: " + json.dumps(ex_names))
    parts.append("Output: " + json.dumps(ex_map))
    parts.append("")
    parts.append("Return a JSON object mapping each input name exactly as given")
    parts.append("to exactly one category above. No prose.")
    parts.append("")
    parts.append("Sectors: " + json.dumps(names))
    return "\n".join(parts)

def ask(model, prompt, timeout=300):
    import requests
    r = requests.post(ENDPOINT, json={
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "format": "json",
        "stream": False,
        "keep_alive": "10m",
        "options": {"temperature": 0, "num_predict": 2048},
    }, timeout=timeout)
    r.raise_for_status()
    raw_text = r.json()["message"]["content"]
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw_text, re.DOTALL)
        return json.loads(m.group(0)) if m else {}

def llm_batch(names):
    remaining = list(names)
    final = {}
    for model in MODEL_CASCADE:
        if not remaining:
            break
        try:
            raw = ask(model, build_prompt(remaining))
        except Exception as e:
            print(f"  {model} failed: {e}", file=sys.stderr)
            continue
        labels = normalize_labels(raw, set(remaining))
        for n, c in labels.items():
            if c in CATS and c != "unclassified":
                final[n] = c
        remaining = [n for n in remaining if n not in final]
    for n in remaining:
        final[n] = "unclassified"
    return final

def main():
    d = json.loads(JSON_PATH.read_text())
    todo = sorted(k for k, v in d.items() if v in ("other", "error", "unclassified"))
    if not todo:
        print("nothing to do")
        return

    n_prefix = 0
    for s in list(todo):
        c = by_prefix(s)
        if c:
            d[s] = c; todo.remove(s); n_prefix += 1

    n_exact = 0
    for s in list(todo):
        if s in EXACT:
            d[s] = EXACT[s]; todo.remove(s); n_exact += 1

    n_llm = 0
    if todo:
        labels = llm_batch(todo)
        for s in todo:
            d[s] = labels.get(s, "unclassified")
            n_llm += 1

    JSON_PATH.write_text(json.dumps(d, indent=2))

    c = Counter(d.values()); t = sum(c.values())
    bad = c.get("other", 0) + c.get("error", 0) + c.get("unclassified", 0)
    print(f"prefix={n_prefix} exact={n_exact} llm={n_llm} "
          f"total={t} bad={bad} ({bad*100//t}%)")
    print("PASS" if bad == 0 else f"FAIL: {bad} unclassified")
    for k, n in c.most_common():
        print(f"  {k:15s} {n:4d} ({n*100//t:2d}%)")

if __name__ == "__main__":
    main()
