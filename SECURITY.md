# Security Policy

## Reporting a vulnerability

Email: security@volatiai.dev (PGP key on request).
Please do not open public issues for security reports.

## Scope

- `workers/sector-slow/src/signing.js` (Ed25519)
- `scripts/verify_signature.py`
- Snapshot chain integrity (`workers/sector-slow/src/chain.js`)

## What signing guarantees

- Integrity of fetched data (canonical JSON hash)
- Chain linkage (`prev_hash`)
- Key identity (`pubkey_id`)

It does **not** guarantee:

- **Source authenticity**: we verify what we fetched, not that the source said the truth
- **Key custody**: if the private key leaks, signatures can be forged.
  Compromise disclosure would be published here.

## Data sources

All collectors fetch from public-domain sources (US government, EU open data,
CC0, CC-BY). No personal data is collected. No commercial third-party sources
(removed 2026-11-04).
