#!/usr/bin/env python3
"""classify_sector.py — classify sector names using local Ollama models.

Uses the Ollama HTTP API (not the `ollama run` CLI) so num_ctx can be
set per-request. Reads sector names from config/sectors.json (the
actual 496 sectors), not config/categories.json (the taxonomy).

Usage:
  python3 scripts/classify_sector.py --self-test
  python3 scripts/classify_sector.py --classify-all
"""
import argparse, json, sys, time, urllib.request
from pathlib import Path

OLLAMA_HOST = "http://127.0.0.1:11434"
NUM_CTX = 8192

# Categories from config/categories.json — the REAL taxonomy
CATEGORIES = {
    "crypto", "macro", "fx", "commodity", "defi",
    "stablecoin", "dex", "tvl", "defi-nft", "other"
}

MODELS = ["qwen2.5:7b", "llama3.1:8b"]

FIXTURES = [
    ("treasuries",           "macro"),
    ("cisa-kev-count",       "other"),   # cybersecurity — no category fits
    ("openfda-food-recalls", "other"),
    ("usgs-earthquakes",     "other"),
]

PROMPT = (
    "Classify this sector into exactly one of: {cats}. "
    "Reply with only the category word, nothing else.\n"
    "Sector: {name}"
)

def api_generate(model, prompt, timeout=180):
    """Call /api/generate with explicit num_ctx."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_ctx": NUM_CTX, "temperature": 0.0},
    }
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read())
        return body.get("response", "").strip(), None
    except Exception as e:
        return None, str(e)[:200]

def classify(name, model):
    prompt = PROMPT.format(cats=", ".join(sorted(CATEGORIES)), name=name)
    out, err = api_generate(model, prompt)
    if err:
        return None, err
    for w in out.lower().split():
        w = w.strip(".,!?;:'\"")
        if w in CATEGORIES:
            return w, None
    return None, f"no category in output: {out[:100]!r}"

def have_ollama():
    try:
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=2)
        return True
    except Exception:
        return False

def pull_model(model):
    """Block until model is local."""
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/pull",
        data=json.dumps({"name": model, "stream": False}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=1800) as r:
        r.read()

def self_test():
    if not have_ollama():
        print("SKIP: ollama not installed or server not running")
        return 0
    for model in MODELS:
        print(f"Ensuring {model}...")
        pull_model(model)
    print(f"\n=== self-test: {len(FIXTURES)} fixtures × {len(MODELS)} models ===")
    passed, failed = 0, 0
    for name, expected in FIXTURES:
        votes = {}
        for model in MODELS:
            result, err = classify(name, model)
            if err:
                print(f"  ✗ {name} [{model}]: {err}")
                votes[model] = None
            else:
                mark = "✓" if result == expected else "✗"
                print(f"  {mark} {name} [{model}] → {result} (expected {expected})")
                votes[model] = result
        valid = [v for v in votes.values() if v is not None]
        if len(valid) == 2 and valid[0] == valid[1] == expected:
            passed += 1
        else:
            failed += 1
    print(f"\nPass: {passed}, Fail: {failed}")
    return 0 if failed == 0 else 1

def load_sectors():
    """Read sectors from config/sectors.json — the actual sector list."""
    for candidate in ["config/sectors.json", "config/active_sectors.json"]:
        p = Path(candidate)
        if p.exists():
            data = json.loads(p.read_text())
            return list(data.keys()) if isinstance(data, dict) else data
    raise FileNotFoundError("Neither config/sectors.json nor config/active_sectors.json found")

def classify_all():
    if not have_ollama():
        print("ERROR: ollama server not reachable", file=sys.stderr)
        return 1
    names = load_sectors()
    print(f"Loaded {len(names)} sectors")
    for model in MODELS:
        print(f"\n=== Classifying with {model} ===")
        pull_model(model)
        results = {}
        t0 = time.time()
        for i, name in enumerate(names):
            result, err = classify(name, model)
            results[name] = result
            if (i + 1) % 10 == 0 or i == len(names) - 1:
                elapsed = time.time() - t0
                print(f"  [{i+1}/{len(names)}] ({elapsed:.0f}s)")
        out = Path(f"config/sector_categories_{model.replace(':','_')}.json")
        out.write_text(json.dumps(results, indent=2))
        print(f"  ✅ {out}")
    return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--classify-all", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if args.classify_all:
        return classify_all()
    ap.print_help()
    return 2

if __name__ == "__main__":
    sys.exit(main())
