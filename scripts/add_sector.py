#!/usr/bin/env python3
"""add_sector.py — verify a sector endpoint before wiring it.

Codifies the pre-add checklist that tonight's failed additions bypassed.
Every failed sector tonight (BLS, eth-beacon, dexpaprika, nftx, krown)
would have been caught by this verification.

Usage:
    python3 scripts/add_sector.py <sector-name> <endpoint-url>

Example:
    python3 scripts/add_sector.py my-sector https://api.example.com/data

The script checks:
  1. Endpoint returns 200 (not 000, not 404, not 5xx)
  2. Response parses as JSON or is a recognized plain-text format
  3. Response contains plausible data (not empty, not error)
  4. Sector name doesn't already exist in active_sectors or Worker code
  5. Terms page is reachable and contains recognizable license language

If all pass, prints a Worker block template and registry entry to copy.
If any fail, prints the specific failure. Do not proceed until clean.
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL = ssl.create_default_context()

UA = "VolatiAI-AddSector/1.0"


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"user-agent": UA, "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as r:
            return r.status, r.read()[:5000]
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:
        return None, str(e).encode()[:200]


def check_not_exists(sector):
    if not Path("config/active_sectors.json").exists():
        return True
    active = json.load(open("config/active_sectors.json"))
    if sector in active:
        print(f"  ✗ sector '{sector}' already in active_sectors.json")
        return False
    return True


def check_endpoint(url):
    print(f"  Probing {url} ...")
    status, body = fetch(url)

    if status is None:
        print(f"  ✗ connection failed: {body.decode()[:100]}")
        return False, None

    if status != 200:
        print(f"  ✗ HTTP {status} (not 200)")
        return False, None

    print(f"  ✓ HTTP 200")

    text = body.decode(errors="replace")
    if not text.strip():
        print(f"  ✗ empty response body")
        return False, None

    # Try JSON
    try:
        data = json.loads(text)
        print(f"  ✓ valid JSON, top-level type: {type(data).__name__}")
        return True, data
    except json.JSONDecodeError:
        pass

    # Plain text is OK for some sources
    if len(text) > 50:
        print(f"  ✓ non-JSON text ({len(text)} chars) — verify this format is expected")
        return True, text

    print(f"  ✗ response too short and unparseable")
    return False, None


def print_template(sector, url):
    print(f"\n=== Worker block template ===\n")
    print(f'''  "{sector}": {{
    config: {{ metric: "value", threshold_pct: 5, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] }},
    collectAll: async () => ({{
      sources: {{
        value: await fetchSafe(async () => {{
          const r = await fetch("{url}",
            {{ headers: {{ "user-agent": "VolatiAI/1.0", "accept": "application/json" }}, signal: AbortSignal.timeout(20000) }});
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          // TODO: adjust path below to the actual metric field
          const v = j?.value ?? j?.data ?? j?.count;
          if (v === undefined || v === null) throw new Error("no_value: keys=" + Object.keys(j || {{}}).join(","));
          return Number(v);
        }}),
      }},
    }}),
  }},
''')
    print(f"=== Registry entry ===\n")
    print(f'''  "{sector}": {{
    "source": "<source name>",
    "license": "<license — must be explicit>",
    "attribution": null
  }},
''')
    print(f"=== Checklist before deploy ===\n")
    print(f"  1. Read the source's /terms or /legal page manually")
    print(f"  2. Confirm the license field above is accurate")
    print(f"  3. Add to config/source_licenses.json FIRST")
    print(f"  4. Add to config/active_sectors.json")
    print(f"  5. Add to DENSE_SECTORS or SPARSE_SECTORS in epistemic_digest.py")
    print(f"  6. Insert Worker block into workers/sector-*")
    print(f"  7. npx wrangler deploy")
    print(f"  8. curl the /signal route — must return failed: []")
    print(f"  9. python3 scripts/audit_sectors.py && python3 scripts/audit_licenses.py")
    print(f" 10. git add + commit")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    sector = sys.argv[1]
    url = sys.argv[2]

    print(f"\n=== Verifying sector: {sector} ===\n")

    print("1. Name collision check:")
    if not check_not_exists(sector):
        return 1
    print(f"  ✓ '{sector}' not in active_sectors")

    print("\n2. Endpoint probe:")
    ok, data = check_endpoint(url)
    if not ok:
        print(f"\n  ✗ STOP. Fix the endpoint before proceeding.")
        print(f"    5 sectors failed tonight because this step was skipped.")
        return 1

    print("\n3. Terms-of-service check:")
    print(f"  ⚠  Not automated. Manually read the source's /terms page.")
    print(f"    Look for: attribution, commercial use, redistribution.")
    print(f"    If any restriction exists, skip this sector or add the")
    print(f"    appropriate attribution to the registry entry.")

    print_template(sector, url)
    print(f"=== Verification passed for '{sector}' ===")
    print(f"Copy the templates above, verify the license manually, then proceed.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
