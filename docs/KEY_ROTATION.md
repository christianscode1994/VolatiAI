# Signing key rotation history

## Current state

| Fingerprint label (snapshots) | Verifies against | Role |
|---|---|---|
| `volatiai-v1` (legacy label, reused) | `docs/pubkey-v0.pem` | v0 key — signed 2026-11-04, 11-05 |
| `volatiai-v1` (legacy label, reused) | `docs/pubkey.pem` | v1 key — signed 2026-11-08, 11-09 |
| `volatiai-b4175311` (fingerprint) | `docs/pubkey.pem` | Active signer from 2026-11-10 |

> `volatiai-v1` was hardcoded in older `sign_snapshot.py`. Both the pre-rotation
> (v0) and post-rotation (v1) keys carried that label. `pubkey_id` therefore
> cannot identify which physical key signed a snapshot before the fingerprint
> fix. The worker resolves ambiguity by trying both keys and reporting
> `signature_key_matched`.

## What happened

On **2026-11-08**, `~/.volatiai/signing.key` was regenerated — either a fresh
machine, or the file was deleted. `_load_or_create_key()` silently created a
new Ed25519 keypair and overwrote `docs/pubkey.pem` with the new public key.
The old private key was not backed up and is gone.

Symptoms observed on 2026-11-09:

- `verify_snapshot("2026-11-04")` returned `signature_valid: false` with no explanation
- `verify_snapshot("2026-11-05")` returned same
- `verify_snapshot("2026-11-08")` returned `signature_valid: true`
- `verify_snapshot("2026-11-09")` returned `signature_valid: true`
- 11-08's `prev_hash` was `null` — the signer restarted the chain silently

The bug: **silent rotation**. `_load_or_create_key()` didn't warn, `PUBKEY_ID`
didn't change, `chain_gap` didn't get set. From the outside, 11-04/05 looked
tampered with.

## Recovery

1. Old public key recovered from git history:
   `git show 6b9fb8c3:docs/pubkey.pem > docs/pubkey-v0.pem`
2. Verified locally: 11-04/05 signatures are valid under the **old** key,
   11-08/09 valid under the **current** key.
3. `toolVerifySnapshot` tries current key first, falls back to `pubkey-v0.pem`
   for dates `< 2026-11-08`.
4. Response field `signature_key_matched` reports which key fired:
   - `"current"` — verified against `docs/pubkey.pem`
   - `"v0-historical"` — verified against `docs/pubkey-v0.pem`
   - `null` — did not verify against either
5. `signature_error` is populated on every failure path. No more `null/null`.

All four signed snapshots now verify:

| Date | Verifies under | `signature_key_matched` |
|---|---|---|
| 2026-11-04 | v0 | `"v0-historical"` |
| 2026-11-05 | v0 | `"v0-historical"` |
| 2026-11-08 | current | `"current"` |
| 2026-11-09 | current | `"current"` |

## Rotation checklist (forward)

Historical rotation happened silently and broke verification without warning.
Any deliberate rotation must follow this order — **wrangler.toml first,
signing second.** Check 9 in `scripts/test-all.py` catches skipped steps,
but the checklist is what prevents the mistake in the first place.

1. **Generate the new key** — `~/.volatiai/signing.key`. Do not overwrite
   the old one until step 6. Back up both.

2. **Derive the new public key + `pubkey_id`.** Use
   `_derive_pubkey_id` from `scripts/sign_snapshot.py`.

3. **Update `workers/volatiai-mcp/wrangler.toml` [vars] BEFORE signing
   anything with the new key.** Set `PUBKEY_CURRENT_ID` and
   `PUBKEY_CURRENT_PEM` to the new values, and demote the old current
   values to `PUBKEY_V0_HIST_ID` / `PUBKEY_V0_HIST_PEM`.

   Retention rule: keep every historical key that signed a
   still-verifiable snapshot. Removing one breaks
   `verify_snapshot(date)` for those dates.

4. **Update `docs/.well-known/volatiai-pubkey.pem`** to the new public
   key. Old key stays at `volatiai-pubkey-v0.pem` for historical
   verification. The `fetched-pages` path in the Worker depends on this
   file.

5. **Update `scripts/fixtures/<new-date>/pub.pem`** to the new public
   key when committing the first signed artifact under the new key.
   Check 9 in `test-all.py` finds this fixture by ID and compares — a
   stale fixture here fails CI on the next commit.

6. **Sign the first snapshot** with the new key. It carries
   `envelope_pubkey_id = volatiai-NEWHASH8`.

7. **Deploy the Worker** — `wdeploy` — so the new key is live before
   any consumer tries to verify the new artifact.

8. **Verify end-to-end:** run `python3 scripts/test-all.py` (check 9
   should pass), `node scripts/verify.cjs <new current.json> <new
   snapshot.json> <new pub.pem>`, and POST the inline envelope to the
   Worker via smoke-test A. Expected: `source: "inline-baked",
   valid: true, matched: "current"`.

The old private key can be destroyed only after all older snapshots
stop being referenced (i.e. after they fall off the retention window
and the `_anchors.jsonl` chain doesn't need re-verification). Until
then, keep it backed up — even if no new artifact will ever be signed
with it again, its absence breaks forensic verification of the
artifacts it did sign.

## Prevention — `pubkey_id` = key fingerprint

`sign_snapshot.py` now derives `pubkey_id` from the signing key's SPKI fingerprint:

    def _derive_pubkey_id(priv):
        spki = priv.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
        return "volatiai-" + hashlib.sha256(spki).hexdigest()[:8]

Two different keys -> two different labels. Silent rotation becomes visible in
every signed snapshot. The current key's fingerprint is `volatiai-b4175311`.

## Archived key — `docs/pubkey-v1-20261109.pem`

Byte-identical to `docs/pubkey.pem` today. When you eventually rotate to v2,
`pubkey.pem` becomes v2 and `pubkey-v1-20261109.pem` becomes the only copy of
v1 — which is what snapshots signed 2026-11-08 through the rotation date will
continue to verify against. Do not edit or delete it.

## Runbook for future rotations

Before touching `~/.volatiai/signing.key` or `docs/pubkey.pem`:

1. Back up the old private key to at least two offline locations. Loss =
   permanent unverifiability of all snapshots signed with it.
2. Archive the old public key under a versioned name, then commit:
   `cp docs/pubkey.pem docs/pubkey-v1-$(date -u +%Y%m%d).pem && git add . && git commit`
3. Rotate and record the new fingerprint (the `_derive_pubkey_id` python snippet)
4. Update `toolVerifySnapshot` with a new fallback block keyed off the rotation date
5. Verify all historical snapshots still verify (the 4-date loop)
6. Add an entry to this file with date, old fingerprint, new fingerprint, reason

## Verify

    for d in 2026-11-04 2026-11-05 2026-11-08 2026-11-09; do
      curl -s -X POST "https://volatiai-mcp.fourieranalys.workers.dev/mcp" \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"verify_snapshot\",\"arguments\":{\"date\":\"$d\"}}}" \
        | jq -r '.result.content[0].text | fromjson | "\(.date): \(.signature_valid) (\(.signature_key_matched))"'
    done

## Revocation: empirical test status (2026-11-10)

The revocation check in `verify_snapshot` fetches `volatiai-key.json` /
`volatiai-key-v0.json` on each call and marks snapshots invalid if their
`signature_valid` came back true but `signed_at > revoked_at`.

**What has been verified empirically:**
- The check runs on every `verify_snapshot` call (verified via `wrangler tail` on canary)
- When `revoked_at` is `null`, it silently no-ops (verified: 5/5 snapshots still return `signature_valid: true`)
- The `verify_snapshot` response shape is unchanged when revocation is not active

**What has NOT been verified empirically:**
- The firing path (when `revoked_at` is set to a past date). Testing this
  requires either mutating the public `volatiai-key.json` (bad — it's the
  trust root) or adding a `--test-key-url` argument (deferred, small change).

**When the firing path will be tested:**
- First real revocation event, OR
- A dedicated session adds `--test-key-url` support for safe testing

The revocation code has been reviewed against the documented behavior
in the key metadata. The unverified path is narrow and well-understood.
