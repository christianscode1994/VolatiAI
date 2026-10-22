"""rss.py — generate RSS 2.0 feed from briefing.json.

Second consumer of the pipeline's data. Forces the schema to be
validated by a second read — if briefing.json changes shape and this
fails, we know before external consumers do.

Published at: https://christianscode1994.github.io/VolatiAI/feed.xml
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape


def _rfc822(iso_string):
    """Convert ISO 8601 timestamp to RFC 822 (RSS format)."""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        dt = datetime.now(timezone.utc)
    return dt.strftime("%a, %d %b %Y %H:%M:%S %z")


def _item_xml(sig, ts):
    """One RSS <item> from a briefing signal."""
    sector = sig.get("sector", "unknown")
    summary = sig.get("summary", "")
    severity = sig.get("severity", "info")
    confidence = sig.get("confidence", 0)
    pct = sig.get("pct_change")

    title = f"{sector}: {summary[:80]}" if summary else sector
    desc = "<p>" + escape(summary) + "</p>"
    desc += "<p>Severity: " + escape(severity) + " / Confidence: " + f"{confidence:.2f}" + "</p>"
    if pct is not None:
        desc += f"<p>Change: {pct:+.1f}%</p>"

    guid = sector + "-" + ts

    return (
        "    <item>\n"
        "      <title>" + escape(title) + "</title>\n"
        "      <description><![CDATA[" + desc + "]]></description>\n"
        "      <link>https://christianscode1994.github.io/VolatiAI/briefing.json</link>\n"
        "      <guid isPermaLink=\"false\">" + escape(guid) + "</guid>\n"
        "      <pubDate>" + _rfc822(ts) + "</pubDate>\n"
        "      <category>" + escape(sector) + "</category>\n"
        "    </item>"
    )


def generate_feed(briefing_path="docs/briefing.json",
                  output_path="docs/feed.xml",
                  max_items=20):
    """Read briefing.json, write RSS 2.0 feed. Returns output path."""
    briefing_path = Path(briefing_path)
    output_path = Path(output_path)

    if not briefing_path.exists():
        raise FileNotFoundError(str(briefing_path) + " not found")

    b = json.loads(briefing_path.read_text())
    ts = b.get("ts", datetime.now(timezone.utc).isoformat() + "Z")
    signals = (b.get("signals") or [])[:max_items]
    headline = (b.get("briefing") or {}).get("headline", "VolatiAI briefing")

    items = "\n".join(_item_xml(s, ts) for s in signals)
    rfc822 = _rfc822(ts)

    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        '  <channel>\n'
        '    <title>VolatiAI Signals</title>\n'
        '    <link>https://christianscode1994.github.io/VolatiAI/</link>\n'
        '    <description>' + escape(headline) + '</description>\n'
        '    <language>en-us</language>\n'
        '    <lastBuildDate>' + rfc822 + '</lastBuildDate>\n'
        '    <atom:link href="https://christianscode1994.github.io/VolatiAI/feed.xml" rel="self" type="application/rss+xml"/>\n'
        + items + '\n'
        '  </channel>\n'
        '</rss>\n'
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(feed, encoding="utf-8")
    return output_path


if __name__ == "__main__":
    path = generate_feed()
    print("wrote: " + str(path))
