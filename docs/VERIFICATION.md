# Independent verification guide

How to verify VolatiAI data from scratch, using only standard tools and
publicly-published artifacts. No trust in VolatiAI servers is required
beyond "the files at github.com/christianscode1994/VolatiAI are what
GitHub says they are" — and even that's detectable if it changes, because
of the anchor log.

## What you can prove

Three things are independently verifiable:

1. **Authenticity** — this snapshot was signed by the entity holding the
   private key for `docs/pubkey.pem` (or the archived `pubkey-v0.pem`).
2. **Integrity** — no bytes were modified after signing.
3. **Existence time** — the exact bytes existed at time T, attested to by
   FreeTSA (a third-party RFC 3161 timestamp authority) at that time.
4. **Unchanged-since-anchor** — the file on GitHub Pages right now has the
   same SHA-256 it had when first anchored to `docs/snapshots/_anchors.jsonl`.

## What you cannot prove

- **Real-world identity** of the signer. The trust anchor is
  `github.com/christianscode1994/VolatiAI` — whoever controls that GitHub
  account controls what "verified" means.
- **Correctness of the underlying data.** Signature proves origin and
  integrity, not that the numbers in the snapshot are accurate.
- **Continuous existence.** A snapshot exists at its TSA time and at the
  time you fetch it. In between, it's only known to exist because of the
  anchor log.

## Prerequisites

    # Python 3.9+, cryptography, curl, openssl, jq
    pip install cryptography

## One-time setup — get the public key(s)

    mkdir -p /tmp/volatiai-verify && cd /tmp/volatiai-verify

    # Current key (fingerprint: volatiai-b4175311)
    curl -sO https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey.pem
    curl -sO https://christianscode1994.github.io/VolatiAI/pubkey.pem
    shasum -a 256 volatiai-pubkey.pem pubkey.pem
    # Both must be: 2d3c6ab4c263516e0fd3b9be83c1abc64c5b3f71ed9aaa3d76dd441fc6d04c28

    # Archived v0 key (fingerprint of: pre-2026-11-08)
    curl -sO https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey-v0.pem
    shasum -a 256 volatiai-pubkey-v0.pem
    # Must be: bb3eee731a3933710879e9d9eaa29361fc58ea739130c641490c88bd9820f76e

    # FreeTSA certs (for timestamp verification)
    curl -sO https://www.freetsa.org/files/cacert.pem
    curl -sO https://www.freetsa.org/files/tsa.crt

    # Snapshot to verify
    DATE=2026-11-09
    curl -sO https://christianscode1994.github.io/VolatiAI/snapshots/$DATE.json
    curl -sO https://christianscode1994.github.io/VolatiAI/snapshots/$DATE.json.tsr

## Check 1 — recompute the hash

The snapshot's `hash` field is SHA-256 over the canonical form of the
snapshot minus `{hash, prev_hash, signature, pubkey_id}`. The canonical
form is `json.dumps(obj, separators=(",", ":"), sort_keys=True)` with
empty strings for `null` values. See `scripts/verify_signature.py` in the
repo for the exact implementation.

    python3 <<'CHECK'
    import json, hashlib
    snap = json.loads(open("2026-11-09.json").read())
    body = {k:v for k,v in snap.items() if k not in ("hash","prev_hash","signature","pubkey_id")}
    canon = json.dumps(body, separators=(",",":"), sort_keys=True, ensure_ascii=False).encode()
    computed = hashlib.sha256(canon).hexdigest()
    print(f"stored:   {snap['hash']}")
    print(f"computed: {computed}")
    print("hash OK" if computed == snap["hash"] else "hash MISMATCH")
    CHECK

Expected: `hash OK` and stored == computed == `dacbff548d9669bc1f967611197863a69b934d9ee411e89a985c2cf435264238`.

## Check 2 — verify the Ed25519 signature

The signature is over the canonical form of the snapshot minus
`{signature, pubkey_id}`. That means it includes `hash`, `prev_hash`,
and `signed_at` — so tampering with any of them invalidates the signature
even if you can recompute the hash.

    python3 <<'CHECK'
    import json, base64
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
    from cryptography.exceptions import InvalidSignature

    snap = json.loads(open("2026-11-09.json").read())
    signable = {k:v for k,v in snap.items() if k not in ("signature","pubkey_id")}
    canon = json.dumps(signable, separators=(",",":"), sort_keys=True, ensure_ascii=False).encode()
    sig = base64.b64decode(snap["signature"])

    # Try current key first, fall back to archived v0 for pre-rotation dates
    for name, pem in [("current", "pubkey.pem"), ("v0-historical", "volatiai-pubkey-v0.pem")]:
        pk = load_pem_public_key(open(pem, "rb").read())
        try:
            pk.verify(sig, canon)
            print(f"signature OK ({name})")
            break
        except InvalidSignature:
            print(f"signature FAIL ({name})")
    else:
        print("signature does not verify against either key")
    CHECK

Expected for 2026-11-09: `signature OK (current)`. For 2026-11-04/05:
`signature FAIL (current)` then `signature OK (v0-historical)`.

## Check 3 — verify the FreeTSA timestamp

The `.tsr` file is an RFC 3161 timestamp reply from FreeTSA. Verifying it
proves FreeTSA witnessed these exact bytes at the attested time.

    openssl ts -verify \
      -in 2026-11-09.json.tsr \
      -data 2026-11-09.json \
      -CAfile cacert.pem \
      -untrusted tsa.crt

Expected: `Verification: OK`. To see the attested time:

    openssl ts -reply -in 2026-11-09.json.tsr -text | grep -A1 "Time stamp:"

Expected: `Nov  9 19:16:03 2026 GMT` (or similar — the actual FreeTSA time).

## Check 4 — verify the file hasn't been modified since being anchored

The anchor log is a public, append-only record of every file's SHA-256 at
first-anchor time. If someone rewrites a snapshot on GitHub Pages after
it was anchored, this check catches it.

    curl -sO https://christianscode1994.github.io/VolatiAI/snapshots/_anchors.jsonl
    python3 <<'CHECK'
    import hashlib, json
    anchor = next(
        json.loads(line) for line in open("_anchors.jsonl")
        if json.loads(line).get("date") == "2026-11-09"
    )
    actual = hashlib.sha256(open("2026-11-09.json", "rb").read()).hexdigest()
    print(f"anchored:  {anchor['file_sha256']}")
    print(f"actual:    {actual}")
    print(f"anchored_at: {anchor['anchored_at']}")
    print("unchanged since anchor" if actual == anchor["file_sha256"] else "FILE TAMPERED SINCE ANCHOR")
    CHECK

Expected: `unchanged since anchor` and `anchored_at: 2026-11-09T19:16:02.525616Z`.

## Check 5 — verify the chain link to the previous day

Each snapshot (except the first in each segment) points at its predecessor
via `prev_hash`. This creates a hash chain like a linked list. Verify one
hop:

    DATE_PREV=2026-11-08
    curl -sO https://christianscode1994.github.io/VolatiAI/snapshots/$DATE_PREV.json

    python3 <<'CHECK'
    import json
    cur  = json.loads(open("2026-11-09.json").read())
    prev = json.loads(open("2026-11-08.json").read())
    print(f"cur.prev_hash:  {cur.get('prev_hash')}")
    print(f"prev.hash:      {prev.get('hash')}")
    print("chain link OK" if cur.get("prev_hash") == prev.get("hash") else "chain BROKEN")
    CHECK

Expected: `chain link OK` and both values equal `ef6057e9329a0b64…`.

**Note:** the chain is 1-hop only. Verifying 2026-11-09 → 2026-11-08 does
not verify 2026-11-08 → 2026-11-07. See `docs/KEY_ROTATION.md` for the
full chain history (there are two verified segments with a gap between
2026-11-05 and 2026-11-08 due to a key rotation).

## Automated — call the MCP server

If you'd rather not run any of the above, the MCP server exposes it all:

    curl -s -X POST https://volatiai-mcp.fourieranalys.workers.dev/mcp \
      -H 'Content-Type: application/json' \
      -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
          "name": "verify_snapshot",
          "arguments": {"date": "2026-11-09"}
        }
      }' | jq

Relevant fields in the response:

- `signature_valid: true` — Ed25519 signature verified
- `signature_key_matched: "current" | "v0-historical" | null` — which key verified
- `signature_error: null | "<reason>"` — populated on every failure
- `hash` — recomputed from canonical form, matches snapshot.hash
- `chain_intact` — 1-hop verification (alias of `prev_link_intact`)
- `prev_hash`, `prev_link_intact` — predecessor link status

## The three-way trust story

| Question | Answer | How to verify |
|---|---|---|
| "Did the signer approve this content?" | `signature_valid: true` | Check 2 (Ed25519) |
| "Has it been modified since?" | Compare `.tsr` time to now | Check 3 + Check 4 |
| "When did it first exist?" | FreeTSA attested time | Check 3 (`openssl ts -reply -text`) |

If all three are `true` / `OK` / `unchanged`, you have cryptographic proof
that:
1. The signer approved this exact byte sequence.
2. Nobody has changed it since the FreeTSA timestamp.
3. It was witnessed by an independent third party at the attested time.

That's the strongest claim VolatiAI makes. It is not "this data is correct"
— it is "this data existed, exactly like this, at time T, and was approved
by whoever holds `docs/pubkey.pem`."

## If a check fails

- **Check 1 fails** (`hash MISMATCH`) — file on GitHub Pages doesn't match
  the hash the signer computed. Investigate immediately: could be tampering,
  or a canonicalization mismatch between signer and verifier.
- **Check 2 fails** (`signature FAIL (current)` + `FAIL (v0-historical)`) —
  file was modified after signing. **Do not trust it.**
- **Check 3 fails** (`Verification: failed`) — either FreeTSA's response
  is wrong, the snapshot is wrong, or the trust chain to FreeTSA's CA is
  broken (check `cacert.pem` sha).
- **Check 4 fails** (`FILE TAMPERED SINCE ANCHOR`) — file was rewritten.
  **Do not trust it** — the earlier anchored version is the real one.
- **Check 5 fails** (`chain BROKEN`) — `prev_hash` doesn't match the
  predecessor's `hash`. Could indicate tampering or an honest gap.
  See `docs/KEY_ROTATION.md` for legitimate gap scenarios.

## Reproducibility note

All the scripts referenced above are in the repo:
- `scripts/verify_signature.py` — reference canonicalization + signature verifier
- `scripts/mirror/anchor_snapshot.py` — how anchors were created
- `scripts/mirror/verify_tsr.py` — automated `.tsr` verification
- `scripts/mirror/verify_anchors.py` — automated anchor-log verification

If any of the above checks fail to reproduce using the shipped scripts,
that's a bug in the tooling, not a reason to distrust the data. Open an
issue or run the scripts directly.

## One-command verification

For a comprehensive check of the entire system in one command:

    ./scripts/verify-all.sh

This runs every check described above automatically and exits non-zero if
anything fails. Useful as:

- A quick health check before deploying
- A first-pass verification for new consumers
- A CI gate for future changes
- A proof-of-correctness anyone can run

The script is pure read-only — it fetches from the MCP endpoint and GitHub
Pages, verifies signatures, checks anchor integrity, and confirms identity
consistency. It never modifies state. It works on any machine with `bash`,
`curl`, `jq`, and `python3`.
