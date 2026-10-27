# VolatiAI Compliance Documentation

**Operator:** Solo developer/operator
**Jurisdiction:** Finland (EU)
**System:** VolatiAI — automated public-data signal synthesis and broadcast
**Nature:** Non-commercial, stateless, broadcast-only
**Last reviewed:** 2026-10-27

## Purpose of this directory

These documents record the operator's compliance assessments and operational policies
for VolatiAI. They exist as evidence of intent, reasoning, and control, and are
maintained as part of the repository history.

They are **internal operational documents**, not legal opinions, and are not a
substitute for advice from a qualified legal professional where that is warranted.

## Index

| Document | Purpose | Applies to |
|---|---|---|
| `ai-act-transparency-assessment.md` | Article 50 disclosure assessment | EU AI Act |
| `no-personalization-policy.md` | MiCA boundary — general signal only | MiCA / FIN-FSA |
| `marketing-approval-process.md` | Content and template control | FIN-FSA expectations |
| `no-personal-data-memo.md` | GDPR data flow assessment | GDPR |
| `CHANGELOG.md` | Record of changes to assessments | — |

## Scope of the system

VolatiAI:

- Fetches data from public APIs (no user-supplied data)
- Synthesizes aggregate signals (no personalization to individual users)
- Broadcasts the same output to all followers via public channels
- Does not accept payments, subscriptions, or accounts
- Does not store visitor data of any kind
- Does not provide financial, medical, legal, or investment advice

## Contact

Issues or inquiries: github.com/christianscode1994/VolatiAI/issues

## Content integrity (Tier 1)

VolatiAI publishes SHA-256 checksums for its data files and a static
`identity.json` documenting the canonical Nostr public key.

**What this provides:** content integrity (files unaltered in transit)
and identity discoverability (readers can cross-reference the Nostr npub).

**What this is not:** a cryptographic authorship signature, a qualified
electronic signature under eIDAS, a trust service, or a custody
arrangement under MiCA. No signing key is held at this stage.

**What would upgrade this to Tier 2:** an actual impersonation threat.
At that point, Ed25519 per-post signing would be added alongside a
revocation list in `identity.json`, a `verify.html` generated from the
identity document (never hand-edited), and a written key-rotation
runbook. None of those are warranted today.

## NIP-05 and DID:web on project pages

VolatiAI is hosted at `christianscode1994.github.io/VolatiAI/` — a
GitHub project page. Two identity mechanisms interact differently with
this path structure:

**DID:web (works):** The bot's DID is `did:web:christianscode1994.github.io:VolatiAI:.well-known`,
which resolves to `https://christianscode1994.github.io/VolatiAI/.well-known/did.json`.
This file is committed and served. The path segments encode the project-page
prefix correctly.

**NIP-05 (does not work):** NIP-05 requires `/.well-known/nostr.json` at the
domain root, which GitHub project pages cannot serve. The file at
`/VolatiAI/.well-known/nostr.json` is accessible by URL but will not be
discovered by NIP-05 lookups on `volatiai@christianscode1994.github.io`.

The canonical Nostr identity is the npub in `identity.json`. NIP-05 would
become functional only if the repo were renamed to a user page
(`christianscode1994.github.io`) or a custom domain were added.
