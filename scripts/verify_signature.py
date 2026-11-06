#!/usr/bin/env python3
"""verify_signature.py — verify Ed25519-signed VolatiAI snapshots.

Requires: pip install cryptography

Usage:
  # Verify a signed snapshot against a public key
  python3 scripts/verify_signature.py snapshot.json pubkey.pem

  # Self-test (generates keypair, signs, verifies, tampers, verifies-failure)
  python3 scripts/verify_signature.py --self-test

  # Canonicalization compatibility test (reads canonical_vectors.json)
  python3 scripts/verify_signature.py --canonical-test

Exit codes:
  0 = valid (or all tests pass)
  1 = invalid signature / failed test
  2 = error (missing file, missing dep, bad format)
"""
import base64
import json
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    from cryptography.hazmat.primitives import serialization
    from cryptography.exceptions import InvalidSignature
except ImportError:
    print("ERROR: pip install cryptography", file=sys.stderr)
    sys.exit(2)


# ─── Canonicalization: MUST match signing.js canonicalize() ───
# signing.js:
#   null/primitives → JSON.stringify(obj)
#   arrays → "[" + map(canonicalize).join(",") + "]"
#   objects → "{k:v,...}" with keys sorted, no whitespace
def canonicalize(obj):
    if obj is None or not isinstance(obj, (dict, list)):
        return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    if isinstance(obj, list):
        return "[" + ",".join(canonicalize(v) for v in obj) + "]"
    parts = [json.dumps(k, separators=(",", ":"), ensure_ascii=False) + ":" + canonicalize(obj[k])
             for k in sorted(obj.keys())]
    return "{" + ",".join(parts) + "}"


# ─── Verification ───────────────────────────────────────────────
def verify_signed(signed, pub_pem_bytes):
    """Return (valid: bool, info_or_reason)."""
    if not isinstance(signed, dict):
        return False, "not_an_object"
    if "signature" not in signed:
        return False, "no_signature"
    if "signed_at" not in signed:
        return False, "no_signed_at"

    try:
        sig_bytes = base64.b64decode(signed["signature"])
    except Exception as e:
        return False, f"bad_signature_base64: {str(e)[:60]}"

    payload = {k: v for k, v in signed.items() if k not in ("signature", "pubkey_id")}
    canonical = canonicalize(payload).encode("utf-8")

    try:
        pub = serialization.load_pem_public_key(pub_pem_bytes)
        if not isinstance(pub, Ed25519PublicKey):
            return False, "not_ed25519_key"
        pub.verify(sig_bytes, canonical)
        return True, {
            "pubkey_id": signed.get("pubkey_id"),
            "signed_at": signed.get("signed_at"),
            "canonical_bytes": len(canonical),
        }
    except InvalidSignature:
        return False, "signature_mismatch"
    except Exception as e:
        return False, f"error: {str(e)[:100]}"


# ─── CLI: verify ────────────────────────────────────────────────
def cmd_verify(snapshot_path, pubkey_path):
    try:
        signed = json.loads(Path(snapshot_path).read_text())
    except Exception as e:
        print(f"ERROR reading {snapshot_path}: {e}", file=sys.stderr)
        return 2
    try:
        pub_pem = Path(pubkey_path).read_bytes()
    except Exception as e:
        print(f"ERROR reading {pubkey_path}: {e}", file=sys.stderr)
        return 2

    valid, info = verify_signed(signed, pub_pem)
    if valid:
        print("✓ VALID")
        print(f"  pubkey_id: {info['pubkey_id']}")
        print(f"  signed_at: {info['signed_at']}")
        print(f"  canonical_bytes: {info['canonical_bytes']}")
        return 0
    else:
        print(f"✗ INVALID: {info}")
        return 1


# ─── CLI: self-test ─────────────────────────────────────────────
def cmd_self_test():
    print("=== Ed25519 sign + verify ===")
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    print("  ✓ keypair generated")

    snapshot = {
        "date": "2026-11-05",
        "pairs": [
            {"a": "treasuries", "b": "treasuries-gov", "r": 0.777},
            {"a": "cisa-kev-count", "b": "cisa-kev-total", "r": 0.993},
            {"a": "gleif-leis", "b": "gleif-total-leis", "r": 0.99},
        ],
    }
    to_sign = {**snapshot, "signed_at": "2026-11-05T12:00:00.000Z"}
    canonical = canonicalize(to_sign).encode("utf-8")
    sig = priv.sign(canonical)
    signed = {
        **to_sign,
        "signature": base64.b64encode(sig).decode(),
        "pubkey_id": "self-test-v1",
    }
    print(f"  ✓ signed ({len(canonical)} canonical bytes)")

    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    print("\n=== verify unmodified (should pass) ===")
    valid, info = verify_signed(signed, pub_pem)
    if not valid:
        print(f"  ✗ FAIL: {info}")
        return 1
    print(f"  ✓ valid, pubkey_id={info['pubkey_id']}")

    print("\n=== tamper signature (should fail) ===")
    tampered = {**signed, "signature": base64.b64encode(b"\x00" * 64).decode()}
    valid, info = verify_signed(tampered, pub_pem)
    if valid:
        print("  ✗ FAIL: tampered sig verified")
        return 1
    print(f"  ✓ correctly rejected: {info}")

    print("\n=== tamper payload field (should fail) ===")
    tampered_data = {**signed, "date": "2026-11-06"}
    valid, info = verify_signed(tampered_data, pub_pem)
    if valid:
        print("  ✗ FAIL: modified field verified")
        return 1
    print(f"  ✓ correctly rejected: {info}")

    print("\n=== verify with different key (should fail) ===")
    other_pem = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    valid, info = verify_signed(signed, other_pem)
    if valid:
        print("  ✗ FAIL: wrong key verified")
        return 1
    print(f"  ✓ correctly rejected: {info}")

    print("\n=== verify with missing signature (should fail) ===")
    no_sig = {k: v for k, v in signed.items() if k != "signature"}
    valid, info = verify_signed(no_sig, pub_pem)
    if valid:
        print("  ✗ FAIL: no-signature accepted")
        return 1
    print(f"  ✓ correctly rejected: {info}")

    print("\n✅ self-test passes")
    return 0


# ─── CLI: canonical-test ────────────────────────────────────────
def cmd_canonical_test():
    vectors_path = Path(__file__).parent.parent / "tests" / "fixtures" / "canonical_vectors.json"
    try:
        vectors = json.loads(vectors_path.read_text())["vectors"]
    except Exception as e:
        print(f"ERROR reading {vectors_path}: {e}", file=sys.stderr)
        return 2

    print(f"=== canonical vectors ({len(vectors)} cases) ===")
    failed = 0
    for i, v in enumerate(vectors):
        got = canonicalize(v["input"])
        expected = v["expected"]
        if got == expected:
            print(f"  ✓ case {i+1}: {expected[:60]}{'…' if len(expected) > 60 else ''}")
        else:
            print(f"  ✗ case {i+1}:")
            print(f"      expected: {expected}")
            print(f"      got:      {got}")
            failed += 1

    if failed > 0:
        print(f"\n❌ {failed}/{len(vectors)} failed — Python canonicalize does NOT match JS")
        print("   JS-signed snapshots will fail Python verification until this is fixed.")
        return 1
    print(f"\n✅ all {len(vectors)} cases match — Python and JS canonicalize are compatible")
    return 0


# ─── Main ───────────────────────────────────────────────────────
def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return cmd_self_test()
    if len(sys.argv) == 2 and sys.argv[1] == "--canonical-test":
        return cmd_canonical_test()
    if len(sys.argv) != 3:
        print(__doc__.strip().split("\n\n")[2], file=sys.stderr)  # usage section
        return 2
    return cmd_verify(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    sys.exit(main())
