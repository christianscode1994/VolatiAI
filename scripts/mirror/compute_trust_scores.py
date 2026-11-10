#!/usr/bin/env python3
"""Compute trust scores for active signals per docs/TRUST_MODEL.md.

Input:  docs/active.json, docs/entities.json
Output: docs/active_with_trust.json (or --print for stdout)

Requires attribution classification heuristics — see TRUST_MODEL.md.
Until the accuracy tracker exists, historical_score is fixed at 0.5.
"""
import argparse, json, sys, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTIVE = ROOT / "docs" / "active.json"
ENTITIES = ROOT / "docs" / "entities.json"
OUT = ROOT / "docs" / "active_with_trust.json"

W_INDEPENDENCE = 0.4
W_ATTRIBUTION = 0.3
W_HISTORICAL = 0.2
W_FRESHNESS = 0.1

def attribution_quality(url):
    """Classify attribution URL into a 0-1 score per TRUST_MODEL.md."""
    if not url:
        return 0.0
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()

    # Direct API to primary source
    if any(h in host for h in ("api.kraken.com", "api.coinbase.com", "api.binance.com",
                                "api.coingecko.com", "api.github.com", "api.npmjs.org",
                                "services.nvd.nist.gov", "api.weather.gov",
                                # Added 2026-11-10 to match docs/attribution_sources.json:
                                "api.carbonintensity.org.uk",   # UK grid intensity
                                "energinet.dk",                 # DK grid intensity (www.*)
                                "usgs.gov",                     # USGS FDSN + any future subdomain
                                "hacker-news.firebaseio.com",   # HN top stories
                                "pypistats.org",                # PyPI download stats
                                # Added 2026-11-10 (batch 2, matches expanded mapping):
                                "pocketworld.org",              # Space weather
                                "api.tweetfeed.live",           # C2 threat feed
                                "api.llama.fi",
                                "api.corona-zahlen.org",
                                "oss.open-digger.cn",
                                "services.swpc.noaa.gov",
                                "phishunt.io",
                                "wttr.in",
                                "api.steampowered.com",
                                "whiskyhunter.net",
                                "api.obis.org")):               # DeFi TVL / DEX volumes
        return 1.0

    # Published dataset with permalink
    if "data." in host or "datasets." in host or "nist.gov" in host:
        return 0.85

    # Named entity URL
    if "wikipedia.org" in host or "wikidata.org" in host:
        return 0.7

    # Major news outlets
    if any(h in host for h in ("reuters.com", "bloomberg.com", "ft.com",
                                "wsj.com", "nytimes.com", "economist.com")):
        return 0.5

    # Blog / aggregator
    if any(h in host for h in ("medium.com", "substack.com", "reddit.com",
                                "twitter.com", "x.com")):
        return 0.3

    # Unknown
    return 0.4

def freshness_score(timestamp_str, now=None):
    if not timestamp_str:
        return 0.0
    try:
        ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
    except Exception:
        return 0.0
    now = now or datetime.now(timezone.utc)
    age_hours = (now - ts).total_seconds() / 3600
    import math
    return math.exp(-age_hours / 24)

def _load_sector_feeds():
    try:
        return json.load(open(Path(__file__).resolve().parents[2] / "docs" / "sector_feeds.json"))
    except Exception:
        return {}

_SECTOR_FEEDS = _load_sector_feeds()


def independence_score(signal, all_signals, entities):
    """Resilience-based independence: how many independent upstream feeds
    does this sector draw from?

    v2 model (2026-11-10): the corroboration-based formula from
    TRUST_MODEL.md (min(1.0, corroborators/3)) requires multiple sectors
    observing the same metric. Empirically we have almost none — the top-25
    rotates daily and cross-metric corroboration is rare. Applying it
    literally would assign 0.0 to 96% of signals.

    Resilience formula instead:
      independence = min(1.0, independent_feed_count / 3)

    1 feed  → 0.333  (single point of failure)
    2 feeds → 0.667  (defense in depth)
    3+ feeds → 1.0  (robust)

    Feeds are declared per-sector in docs/sector_feeds.json. Two sectors
    sharing any feed identifier are correlated (handled separately when
    corroboration is checked). This score is per-signal, reflecting the
    source architecture of the sector that produced it.
    """
    sector = signal.get("sector", "")
    feeds = _SECTOR_FEEDS.get(sector)
    if feeds is None:
        return 0.333  # unmapped sector — treat as single-source by default
    return min(1.0, max(0.0, len(feeds) / 3.0))

def historical_score(signal, entities):
    # Neutral until accuracy tracker exists
    return 0.5

def score_signal(signal, all_signals, entities):
    ind = independence_score(signal, all_signals, entities)
    attr = attribution_quality(signal.get("attribution"))
    hist = historical_score(signal, entities)
    fresh = freshness_score(signal.get("timestamp"))
    score = (W_INDEPENDENCE * ind + W_ATTRIBUTION * attr
             + W_HISTORICAL * hist + W_FRESHNESS * fresh)
    return {
        "independence": round(ind, 3),
        "attribution": round(attr, 3),
        "historical": round(hist, 3),
        "freshness": round(fresh, 3),
        "score": round(score, 3),
        "weights": {
            "w_independence": W_INDEPENDENCE,
            "w_attribution": W_ATTRIBUTION,
            "w_historical": W_HISTORICAL,
            "w_freshness": W_FRESHNESS,
        },
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true", help="print instead of write")
    ap.add_argument("--limit", type=int, default=10, help="how many to print")
    args = ap.parse_args()

    if not ACTIVE.exists():
        print(f"❌ {ACTIVE} missing"); sys.exit(1)
    if not ENTITIES.exists():
        print(f"❌ {ENTITIES} missing"); sys.exit(1)

    active = json.loads(ACTIVE.read_text())
    entities = json.loads(ENTITIES.read_text())
    signals = active.get("signals", [])
    if not signals:
        print("❌ no signals in active.json"); sys.exit(1)

    scored = []
    for s in signals:
        s2 = dict(s)
        s2["trust"] = score_signal(s, signals, entities)
        scored.append(s2)

    out = dict(active)
    out["signals"] = scored
    out["_trust_model"] = {
        "version": 1,
        "doc": "https://christianscode1994.github.io/VolatiAI/TRUST_MODEL.md",
        "note": "Trust score ≠ importance ≠ correctness. See TRUST_MODEL.md.",
    }

    if args.print:
        for s in scored[:args.limit]:
            t = s["trust"]
            print(f"{s['sector']:35s}  trust={t['score']:.3f}  "
                  f"(ind={t['independence']:.2f} attr={t['attribution']:.2f} "
                  f"hist={t['historical']:.2f} fresh={t['freshness']:.2f})")
    else:
        OUT.write_text(json.dumps(out, indent=2))
        print(f"✅ wrote {OUT}  ({len(scored)} signals scored)")

if __name__ == "__main__":
    main()
