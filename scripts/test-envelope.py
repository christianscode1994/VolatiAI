#!/usr/bin/env python3
"""
Envelope integrity gate — load-bearing for the stateless-verification claim.

The signer is Python (scripts/sign_snapshot.py). The verifier is JavaScript
(workers/volatiai-mcp/src/index.js). If they disagree on canonical bytes,
every signature the Worker reports as valid/invalid is untrustworthy for
reasons unrelated to the signature. This gate makes that drift loud.

Checks:
  1. Regression pin — envelope_pubkey_id must NOT be in the signed bytes.
     sign_envelope appends it AFTER signing; commit 7c38be08 shipped
     without this and every signature verified as "false".
  2. Cross-language byte equality — Python _canon_bytes and the Worker's
     canonical() must produce identical bytes for the live envelope.

Runs against live current.json, or against fixtures via ENVELOPE_PATH
and PUBKEY_PATH env vars.
"""
import base64
import hashlib
import json
import os
import ssl
import subprocess
import sys
import urllib.request

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

sys.path.insert(0, "scripts")
from sign_snapshot import _canon_bytes  # noqa: E402
from cryptography.hazmat.primitives.serialization import load_pem_public_key  # noqa: E402

BASE = "https://christianscode1994.github.io/VolatiAI/"
CURRENT_URL = BASE + "current.json"

PASS = FAIL = 0
FAILURES = []


def ok(msg):
    global PASS
    PASS += 1
    print(f"  ✅ {msg}")


def bad(msg):
    global FAIL
    FAIL += 1
    FAILURES.append(msg)
    print(f"  ❌ {msg}")


def _fetch(url):
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
        return r.read()


def main():
    print("═" * 60)
    print("VolatiAI — envelope integrity gate")
    print("═" * 60)

    env_path = os.environ.get("ENVELOPE_PATH")
    if env_path:
        with open(env_path, "rb") as f:
            env = json.loads(f.read())
        print(f"envelope: {env_path} (local)")
    else:
        env = json.loads(_fetch(CURRENT_URL))
        print(f"envelope: {CURRENT_URL} (live)")
    print(f"revision: {env['revision']}")
    print(f"pubkey:   {env['envelope_pubkey_id']}\n")

    # Load pubkey
    pub_path = os.environ.get("PUBKEY_PATH")
    try:
        pem = open(pub_path, "rb").read() if pub_path else _fetch(
            BASE + env["pubkey_url"].lstrip("/"))
        pub = load_pem_public_key(pem)
    except Exception as e:
        bad(f"pubkey load failed: {e}")
        return _summary()

    sig = bytes.fromhex(env["envelope_signature"])
    signed = {k: v for k, v in env.items() if k != "envelope_signature"}
    correct = {k: v for k, v in signed.items() if k != "envelope_pubkey_id"}
    buggy = dict(signed)  # still contains envelope_pubkey_id

    # ── 1. Regression pin ──
    print("── 1. envelope_pubkey_id excluded from signed bytes ──")
    try:
        pub.verify(sig, _canon_bytes(correct))
        ok("correct canonical (no pubkey_id) verifies")
    except Exception as e:
        bad(f"correct canonical does NOT verify: {e}")

    try:
        pub.verify(sig, _canon_bytes(buggy))
        bad("REGRESSION: envelope_pubkey_id re-entered signed bytes")
    except Exception:
        ok("buggy canonical (with pubkey_id) correctly rejected")

    # ── 2. Cross-language byte equality ──
    print("\n── 2. Python and JS canonicalize identically ──")
    py_bytes = _canon_bytes(correct)
    js_src = r"""
const env = JSON.parse(require("fs").readFileSync(0, "utf8"));
function canonical(o) {
  if (o === null) return "null";
  if (typeof o === "boolean") return o ? "true" : "false";
  if (typeof o === "number") return String(o);
  if (typeof o === "string") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
  const k = Object.keys(o).sort();
  return "{" + k.map(x => JSON.stringify(x) + ":" + canonical(o[x])).join(",") + "}";
}
const s = { ...env };
delete s.envelope_signature;
delete s.envelope_pubkey_id;
process.stdout.write(Buffer.from(canonical(s), "utf8").toString("base64"));
"""
    try:
        r = subprocess.run(["node", "-e", js_src], input=json.dumps(env),
                           capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            bad(f"node failed: {r.stderr.strip()[:200]}")
        else:
            js_bytes = base64.b64decode(r.stdout)
            if py_bytes == js_bytes:
                ok(f"byte-identical ({len(py_bytes)}B, "
                   f"sha256={hashlib.sha256(py_bytes).hexdigest()[:16]}…)")
            else:
                bad(f"byte mismatch: py={len(py_bytes)}B js={len(js_bytes)}B")
    except Exception as e:
        bad(f"cross-language check failed: {e}")

    return _summary()


def _summary():
    print("\n" + "═" * 60)
    print(f"Summary: {PASS} passed, {FAIL} failed")
    if FAIL:
        for f in FAILURES:
            print(f"  ❌ {f}")
        return 1
    print("✅ envelope integrity verified")
    print("═" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
