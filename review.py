#!/usr/bin/env python3
"""Quality review of classification data.

Two signals:
  strong -- matched PREFIX or EXACT (deterministic)
  hinted -- name contains a token that is a whole-word hint for its category
  weak   -- no signal at all for its assigned category

Flags only two kinds of issues:
  no_signal -- name has zero hints for its assigned category (worth a look)
  conflict  -- name has no hint for its assigned category but does for another
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

JSON_PATH = Path("config/sector_categories_ollama.json")

# Hints are matched as WHOLE TOKENS, not substrings.
# No 2-char hints -- they match everywhere.
HINTS = {
    "developer":       ["code","sdk","api","apis","pkg","package","packages","crate","crates","npm","pypi","nuget","git","repo","repository","lib","release","module","artifact","artifacts","compile","build"],
    "defi":            ["defi","swap","swaps","yield","yields","tvl","liquidity","aave","uniswap","compound","curve","lending","borrow"],
    "dex":             ["dex","exchange","orderbook","amm","pools"],
    "crypto":          ["crypto","blockchain","btc","bitcoin","eth","ethereum","wallet","wallets","token","tokens","gas"],
    "stablecoin":      ["stablecoin","stablecoins","usdc","usdt","dai"],
    "nft":             ["nft","nfts","collectible","mint","opensea"],
    "fx":              ["fx","forex","eur","usd","gbp","currency"],
    "macro":           ["gdp","cpi","fed","bonds","inflation","economic","economics","treasury","debt","yield_curve"],
    "infrastructure":  ["status","cloud","server","servers","uptime","network","networks","bgp","dns","cdn","hosting"],
    "security":        ["security","vuln","vulnerability","vulnerabilities","cve","kev","threat","threats","exploit","abuse"],
    "ai":              ["ai","ml","model","models","llm","gpt","bert","neural","neural_net","learn"],
    "science":         ["science","physics","chemistry","biology","doi","paper","papers","cern","opendata","specimens","datasets"],
    "research":        ["research","citation","citations","crossref","datacite","zenodo","doaj"],
    "environment":     ["env","environment","weather","climate","air","water","earth","quake","quakes","usgs","carbon","emissions"],
    "energy":          ["energy","power","oil","solar","wind","smr","electricity"],
    "commodity":       ["commodity","commodities","gold","silver","fertilizer","mineral","minerals"],
    "health":          ["health","fda","drug","drugs","device","disease","clinical","medical","covid"],
    "demographics":    ["population","census","demo","refugee","refugees","migration","demographics"],
    "jobs":            ["job","jobs","career","careers","hiring","employ","employment"],
    "sports":          ["sport","sports","game","games","team","teams","score","scores","league","player","players"],
    "commerce":        ["commerce","shop","store","product","products","price","prices","order","orders","tender","tenders","commerce"],
    "media":           ["media","news","tv","radio","film","music","art","arts","comic","comics","photos","articles"],
    "knowledge":       ["wiki","wikipedia","encyclopedia","directory","directories","catalog","catalog","books","reference"],
    "transport":       ["transport","train","trains","plane","planes","flight","flights","ship","ships","car","cars","vehicles","bike","bikes","adsb","port","ports","rail"],
    "geography":       ["geo","map","maps","place","places","country","countries","region","regions","zip"],
    "politics":        ["politics","political","election","elections","vote","votes","bill","bills","civic","ballot"],
    "legal":           ["legal","law","laws","court","regulation","regulations","disclosure","disclosures"],
}


def tokens(name):
    return [t for t in name.lower().replace("_", "-").split("-") if t]


def signal(name, category, prefix_hits, exact_hits):
    if name in exact_hits:
        return "strong"
    if any(name.lower().startswith(p) for p in prefix_hits):
        return "strong"
    toks = set(tokens(name))
    for h in HINTS.get(category, []):
        if h in toks:
            return "hinted"
    return "weak"


def hint_categories_present(name):
    """Return categories whose hints appear as whole tokens in the name."""
    toks = set(tokens(name))
    cats = set()
    for cat, hs in HINTS.items():
        if any(h in toks for h in hs):
            cats.add(cat)
    return cats


def main():
    d = json.loads(JSON_PATH.read_text())

    try:
        sys.path.insert(0, str(Path.cwd()))
        import classify_residue as cr
        prefix_hits = list(cr.PREFIX.keys())
        exact_hits = set(cr.EXACT.keys())
    except Exception as e:
        print(f"warning: could not import classify_residue ({e})", file=sys.stderr)
        prefix_hits, exact_hits = [], set()

    by_strength = defaultdict(list)
    no_signal = []
    conflicts = []

    for name, cat in sorted(d.items()):
        if cat in ("misc", "unclassified", "other", "error"):
            continue
        s = signal(name, cat, prefix_hits, exact_hits)
        by_strength[s].append((name, cat))
        if s == "weak":
            other_cats = hint_categories_present(name) - {cat}
            if other_cats:
                conflicts.append((name, cat, sorted(other_cats)))
            else:
                no_signal.append((name, cat))

    total = len(d)
    print(f"total={total}\n")
    print("Signal strength (non-misc/unclassified only):")
    for level in ("strong", "hinted", "weak"):
        n = len(by_strength[level])
        print(f"  {level:8s} {n:4d} ({n*100//max(1,sum(len(v) for v in by_strength.values())):2d}%)")

    print(f"\nConflict (no signal for assigned cat, has signal for another): {len(conflicts)}")
    for name, cat, others in conflicts[:20]:
        print(f"  {name:40s} {cat:15s} hints: {', '.join(others)}")
    if len(conflicts) > 20:
        print(f"  ... and {len(conflicts)-20} more")

    print(f"\nNo-signal (nothing matched for assigned cat): {len(no_signal)}")
    for name, cat in no_signal[:20]:
        print(f"  {name:40s} -> {cat}")
    if len(no_signal) > 20:
        print(f"  ... and {len(no_signal)-20} more")


if __name__ == "__main__":
    main()
