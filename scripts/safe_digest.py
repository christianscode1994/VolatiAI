"""VolatiAI digest compliance wrapper (Python port of safe_digest.mjs).

Neutralizes "signaling" language, filters high-risk financial signals on
Telegram/Mastodon, and appends a mandatory footer (attribution + disclaimers).

Usage:
    from safe_digest import safe_digest
    safe = safe_digest(raw_digest, platform="telegram")
"""
import os
import re

SITE = os.environ.get("VOLATIAI_SITE", "https://christianscode1994.github.io/VolatiAI")

FOOTER = f"""━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Informational only. Not financial, medical, or legal advice.
🤖  Automated bot · AI-generated content · Non-commercial · Stateless
📚  Attribution: {SITE}/attribution.json
📄  Terms: {SITE}/terms.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""

# High-risk financial patterns — filtered on Telegram/Mastodon only
HIGH_RISK = re.compile(
    r"coinbase-|kraken-|\bdex-|defi-|stablecoin-|exchange-spread|"
    r"^treasuries|^fed-rate|^btc-|^eth-|nbp-gold",
    re.IGNORECASE | re.MULTILINE,
)

TRANSFORMS = [
    # "signaling N runs in a row" → "above threshold N/N checks"
    (re.compile(r"[↗↑] (\S+): signaling (\d+) runs(?: in a row)?"),
     r"\1: above threshold \2/\2 checks"),
    # down/up runs → checks
    (re.compile(r"↓ (\S+): down (\d+) runs"), r"\1: down \2 checks"),
    (re.compile(r"↑ (\S+): up (\d+) runs"),   r"\1: up \2 checks"),
    # strip leftover leading arrows
    (re.compile(r"^↗ ", re.MULTILINE), ""),
    (re.compile(r"^↘ ", re.MULTILINE), ""),
    (re.compile(r"^↑ ", re.MULTILINE), ""),
    (re.compile(r"^↓ ", re.MULTILINE), ""),
    # headers
    (re.compile(r"🔬 VolatiAI Epistemic Digest"), "🔬 VolatiAI — Public Data Digest"),
    (re.compile(r"📈 Trends$", re.MULTILINE),
     "📊 Trends (raw deltas · 5-check window)"),
    (re.compile(r"🟡 Events$", re.MULTILINE), "🟡 New items detected"),
    (re.compile(r"🔴 Dense signals$", re.MULTILINE), "🔴 Frequent-change sectors"),
    (re.compile(r"⚪ Slow trends$", re.MULTILINE), "⚪ Slow-change sectors"),
    # event lines
    (re.compile(r"✓ (\S+) \(100%\)"), r"• \1: 1 new item"),
    (re.compile(r"🔔 (\S+): silent (\d+) runs, now signaling"),
     r"🔔 \1: was quiet \2 checks, now above threshold"),
]


def _sanitize(text: str) -> str:
    out = text
    for pat, repl in TRANSFORMS:
        out = pat.sub(repl, out)
    return out


def _filter_high_risk(text: str) -> str:
    kept = []
    removed = 0
    for line in text.split("\n"):
        if HIGH_RISK.search(line):
            removed += 1
        else:
            kept.append(line)
    if removed:
        kept.append("")
        kept.append(f"[{removed} financial signals omitted on this platform — see {SITE}/intel.json]")
    return "\n".join(kept)


def safe_digest(raw_text: str, platform: str = "all") -> str:
    """Return a platform-safe version of the digest."""
    out = _sanitize(raw_text)

    if platform in ("telegram", "mastodon"):
        out = _filter_high_risk(out)

    out = out.rstrip() + "\n\n" + FOOTER

    if platform in ("mastodon", "bluesky"):
        out += "\n\n#NotFinancialAdvice #DataJournalism"

    return out


# CLI for testing
if __name__ == "__main__":
    import sys
    platform = "all"
    if "--platform" in sys.argv:
        platform = sys.argv[sys.argv.index("--platform") + 1]
    input_text = sys.stdin.read()
    sys.stdout.write(safe_digest(input_text, platform))
