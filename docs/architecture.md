# Architecture

One-page data flow for VolatiAI.

## Components

- **Collectors** — fetch from public-domain sources (US gov, EU open data, CC0, CC-BY)
- **Worker** (`sector-slow`) — 5-shard cron at `57 3 * * *`; writes to KV:
  - `_corr_YYYY-MM-DD` (correlation snapshot)
  - `_cron_shards_YYYY-MM-DD` (shard completion)
  - `/health` exposes `shards.seen`, `shards.expected`, `last_cron`
- **Snapshot builder** — canonicalize JSON → SHA-256 → Ed25519 sign
  - `workers/sector-slow/src/signing.js`
  - `workers/sector-slow/src/chain.js` (prev_hash linking)
- **Static docs** — `docs/*.json` + `docs/*.html` generated per run
- **Verification** — `scripts/verify_signature.py`, `scripts/test_all.sh`,
  `scripts/smoke_prod.sh`, `scripts/check_all.sh`

## Data flow

    collectors
        │
        ▼
    worker (5 shards) ──► KV: _corr_YYYY-MM-DD, _cron_shards_YYYY-MM-DD
        │                         │
        │                         ▼
        │                    /health, /_correlation
        ▼
    snapshot (canonical + hash + sign)
        │
        ▼
    chain (prev_hash chain)
        │
        ▼
    docs/*.json ──► docs/*.html (static site)

## Trust boundary

- Signing key lives only in Cloudflare Secrets
- Public key + `pubkey_id` published; old pubkeys kept for rotation
- Verification is local:
  `python3 scripts/verify_signature.py <snapshot.json> <pubkey.json>`

## Verification commands

| What                  | Command                                                |
|-----------------------|--------------------------------------------------------|
| All unit tests        | `./scripts/test_all.sh`                                |
| Signing self-test     | `python3 scripts/verify_signature.py --self-test`      |
| JS↔Python canonical   | `python3 scripts/verify_signature.py --canonical-test` |
| Cron / shard status   | `./verify-cron.sh`                                     |
| Production smoke      | `./scripts/smoke_prod.sh`                              |
| All of the above      | `./scripts/check_all.sh`                               |
