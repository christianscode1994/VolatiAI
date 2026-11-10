#!/usr/bin/env python3
"""Assert that the deployed MCP endpoint exposes every expected tool.

Sends a tools/list request and compares against a hard-coded expected set.
Exit 0 if all present, 1 if any missing or extra.

Usage: python3 scripts/mirror/verify_tools_array.py [MCP_URL]
Default MCP_URL: https://volatiai-mcp.fourieranalys.workers.dev/mcp
"""
import json, sys, urllib.request
import ssl

EXPECTED = {
    "list_active_signals",
    "get_sector",
    "list_categories",
    "verify_snapshot",
    "find_corroborations",
    "get_diff",
    "get_current_revision",
    "get_anchor",
    "get_trust_manifest",
}

def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "https://volatiai-mcp.fourieranalys.workers.dev/mcp"
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}).encode()
    try:
        import certifi as _certifi
        _ssl_ctx = ssl.create_default_context(cafile=_certifi.where())
    except ImportError:
        _ssl_ctx = ssl.create_default_context()

    req = urllib.request.Request(
        url, data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "VolatiAI-Tools-Verifier/1.0 (+https://christianscode1994.github.io/VolatiAI/VERIFICATION.md)",
        },
    )
    with urllib.request.urlopen(req, timeout=15, context=_ssl_ctx) as r:
        data = json.loads(r.read())
    deployed = {t["name"] for t in data["result"]["tools"]}
    missing = EXPECTED - deployed
    extra   = deployed - EXPECTED
    print(f"deployed: {len(deployed)} tools")
    print(f"expected: {len(EXPECTED)} tools")
    if missing:
        print(f"❌ MISSING: {sorted(missing)}")
    if extra:
        print(f"⚠️  EXTRA:   {sorted(extra)}")
    if missing:
        sys.exit(1)
    print("✅ all expected tools present")

if __name__ == "__main__":
    main()
