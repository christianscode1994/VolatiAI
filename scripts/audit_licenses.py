#!/usr/bin/env python3
"""Audit Worker code for restricted sources and browser-UA spoofing."""
import re
import sys
from pathlib import Path

# Domains known to prohibit automated commercial access. Add as discovered.
RESTRICTED = {
    "query1.finance.yahoo.com": "Yahoo Finance (ToS prohibits automated access)",
    "query2.finance.yahoo.com": "Yahoo Finance (ToS prohibits automated access)",
    "finance.yahoo.com":        "Yahoo Finance (ToS prohibits automated access)",
    "opensky-network.org":      "OpenSky (CC BY-NC 4.0)",
    "econdb.com":               "EconDB (commercial)",
    "api.deezer.com":           "Deezer (commercial redistribution restricted)",
    "remoteok.com":             "RemoteOK (commercial redistribution unclear)",
}

# A Worker setting a browser-like UA to call a domain is circumventing
# access controls even if the domain isn't on the restricted list.
BROWSER_UA = re.compile(r'user-agent[\'"]?\s*:\s*[\'"]([^\'"]*(?:Mozilla|Chrome|Safari)[^\'"]*)[\'"]', re.I)
URL_RE = re.compile(r'https?://([^\s\'"`\)\\/]+)')

hits = []
for worker in Path("workers").glob("*/src/index.js"):
    src = worker.read_text()
    # Restricted domain references
    for domain, reason in RESTRICTED.items():
        if domain in src:
            for i, line in enumerate(src.split("\n"), 1):
                if domain in line:
                    hits.append(f"{worker}:{i}  RESTRICTED: {domain}  ({reason})")
    # Browser UA spoofing
    for m in BROWSER_UA.finditer(src):
        ua = m.group(1)
        # Find closest preceding URL to identify the target domain
        before = src[:m.start()]
        urls = URL_RE.findall(before[-500:])
        target = urls[-1] if urls else "?"
        line = src[:m.start()].count("\n") + 1
        hits.append(f"{worker}:{line}  BROWSER_UA_SPOOF on {target}: {ua}")

if hits:
    print("LICENSE/AUTH VIOLATIONS FOUND:")
    for h in hits:
        print(f"  {h}")
    sys.exit(1)

print("✓ No restricted sources or browser-UA spoofing in Worker code")
sys.exit(0)
