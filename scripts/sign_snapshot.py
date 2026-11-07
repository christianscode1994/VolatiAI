#!/usr/bin/env python3
"""Sign a snapshot JSON file: add hash, prev_hash, pubkey_id, signature.

Usage:
  python3 scripts/sign_snapshot.py --generate-key
  python3 scripts/sign_snapshot.py docs/snapshots/2026-11-05.json

Reads signing key from:
  $VOLATIAI_PRIVKEY (base64-encoded PEM), OR
  ~/.volatiai/signing.key (PEM, auto-generated on first use)

Uses canonicalize() from verify_signature.py — guaranteed match.
"""
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP_DIR = ROOT / "docs" / "snapshots"
PUBKEY_PATH = ROOT / "docs" / "pubkey.pem"
HOME_KEY = Path.home() / ".volatiai" / "signing.key"
PUBKEY_ID = "volatiai-v1"

sys.path.insert(0, str(ROOT / "scripts"))
try:
    import verify_signature as vs
    CANON = vs.canonicalize
except Exception as e:
    print(f"✗ cannot import verify_signature: {e}", file=sys.stderr)
    sys.exit(2)


def _canon_bytes(obj):
    """canonicalize() may return bytes or a JSON-compatible object. Handle both."""
    r = CANON(obj)
    if isinstance(r, bytes):
        return r
    return json.dumps(r, sort_keys=True, separators=(",", ":")).encode()


def _load_or_create_key():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        load_pem_private_key,
        Encoding,
        PrivateFormat,
        PublicFormat,
        NoEncryption,
    )

    env = os.environ.get("VOLATIAI_PRIVKEY")
    if env:
        try:
            pem = base64.b64decode(env)
        except Exception:
            pem = env.encode()
        return load_pem_private_key(pem, password=None)

    if HOME_KEY.exists():
        return load_pem_private_key(HOME_KEY.read_bytes(), password=None)

    print(f"⚠️  No key found. Generating new keypair at {HOME_KEY}", file=sys.stderr)
    priv = Ed25519PrivateKey.generate()
    HOME_KEY.parent.mkdir(parents=True, exist_ok=True)
    HOME_KEY.write_bytes(
        priv.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    HOME_KEY.chmod(0o600)
    PUBKEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBKEY_PATH.write_bytes(
        priv.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )
    print(f"⚠️  Wrote {PUBKEY_PATH} — COMMIT THIS to git", file=sys.stderr)
    print(f"⚠️  BACK UP {HOME_KEY} — losing it = cannot sign again", file=sys.stderr)
    return priv


def _prev_hash(date_str):
    """Hash of the most recent snapshot strictly before date_str."""
    if not SNAP_DIR.exists():
        return None
    earlier = sorted(p for p in SNAP_DIR.glob("*.json") if p.stem < date_str)
    if not earlier:
        return None
    try:
        return json.loads(earlier[-1].read_text()).get("hash")
    except Exception:
        return None


def sign_file(path):
    path = Path(path)
    if not path.exists():
        print(f"✗ no such file: {path}", file=sys.stderr)
        return 1

    snap = json.loads(path.read_text())

    # Add signed_at (required by verify_signature.py)
    from datetime import datetime, timezone
    snap["signed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 1. Compute hash from payload WITHOUT hash/prev_hash/sig/pubkey_id
    base_payload = {k: v for k, v in snap.items()
                    if k not in ("hash", "prev_hash", "signature", "pubkey_id")}
    h = hashlib.sha256(_canon_bytes(base_payload)).hexdigest()

    # 2. Attach hash + prev_hash before signing
    snap["hash"] = h
    snap["prev_hash"] = _prev_hash(path.stem)

    # 3. Sign — matches verify logic: sign `signed - {signature, pubkey_id}`
    signable = {k: v for k, v in snap.items() if k not in ("signature", "pubkey_id")}
    priv = _load_or_create_key()
    sig = priv.sign(_canon_bytes(signable))

    # 4. Attach pubkey_id + signature
    snap["pubkey_id"] = PUBKEY_ID
    snap["signature"] = base64.b64encode(sig).decode()

    path.write_text(json.dumps(snap, indent=2, sort_keys=True))
    ph = snap["prev_hash"] or "null"
    print(f"✓ signed {path.name}")
    print(f"  hash:      {h[:16]}...")
    print(f"  prev_hash: {ph[:16] + '...' if ph != 'null' else 'null'}")
    print(f"  pubkey_id: {PUBKEY_ID}")
    print(f"  signature: {snap['signature'][:16]}...")
    return 0


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    if sys.argv[1] == "--generate-key":
        _load_or_create_key()
        print(f"✓ key ready: {HOME_KEY}")
        if PUBKEY_PATH.exists():
            print(f"✓ pubkey:    {PUBKEY_PATH}")
        return 0
    return sign_file(sys.argv[1])


if __name__ == "__main__":
    sys.exit(main())
