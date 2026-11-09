#!/usr/bin/env python3
"""Sync docs/pubkey.pem and .well-known/volatiai-pubkey.pem from VOLATIAI_PRIVKEY.

Called by the workflow before signing, ensures published pubkey always
matches the private key used to sign. Prevents stale-pubkey-after-rotation.
"""
import base64
import os
import pathlib
import sys

from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key, Encoding, PublicFormat
)

env = os.environ.get("VOLATIAI_PRIVKEY", "").strip()
if not env:
    print("⚠️ VOLATIAI_PRIVKEY not set, skipping pubkey sync")
    sys.exit(0)

try:
    priv = load_pem_private_key(base64.b64decode(env), password=None)
    pub_pem = priv.public_key().public_bytes(
        encoding=Encoding.PEM,
        format=PublicFormat.SubjectPublicKeyInfo,
    )
    for p in ["docs/pubkey.pem", "docs/.well-known/volatiai-pubkey.pem"]:
        path = pathlib.Path(p)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pub_pem)
        print(f"✓ {p}")
    raw = priv.public_key().public_bytes(
        encoding=Encoding.Raw, format=PublicFormat.Raw
    ).hex()
    print(f"  pubkey: {raw[:32]}...")
except Exception as e:
    print(f"❌ pubkey sync failed: {e}", file=sys.stderr)
    sys.exit(1)
