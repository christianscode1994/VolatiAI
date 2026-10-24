#!/usr/bin/env python3
"""verify_signature.py — verify Ed25519 signature on a /latest payload."""
import base64, hashlib, json, sys
from pathlib import Path

def canonical(obj):
    """RFC 8785-ish canonical JSON — sorted keys, no whitespace."""
    if obj is None or not isinstance(obj, (dict, list)):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if isinstance(obj, list):
        return "[" + ",".join(canonical(x) for x in obj) + "]"
    keys = sorted(obj.keys())
    return "{" + ",".join(json.dumps(k) + ":" + canonical(obj[k]) for k in keys) + "}"

def verify(payload, pubkey_hex):
    """Verify Ed25519 signature. Returns True/False/None (unsigned)."""
    sig = payload.get("signature")
    if not sig:
        return None  # unsigned
    if sig.get("alg") != "Ed25519":
        return False
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.hazmat.primitives import serialization

        pk_bytes = bytes.fromhex(pubkey_hex)
        pub = Ed25519PublicKey.from_public_bytes(pk_bytes)

        sig_bytes = base64.b64decode(sig["value"])

        # Canonical form WITHOUT the signature block
        signable = {k: v for k, v in payload.items() if k != "signature"}
        msg = (canonical(signable) + "\n").encode("utf-8")

        pub.verify(sig_bytes, msg)
        return True
    except Exception as e:
        print(f"verify error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    payload = json.load(sys.stdin)
    pubkey_hex = sys.argv[1] if len(sys.argv) > 1 else None
    if not pubkey_hex:
        sys.exit("usage: verify_signature.py <pubkey_hex> < payload.json")
    result = verify(payload, pubkey_hex)
    if result is True:
        print("✅ signature valid")
        sys.exit(0)
    elif result is False:
        print("❌ signature invalid")
        sys.exit(1)
    else:
        print("⚠️  unsigned payload")
        sys.exit(2)
