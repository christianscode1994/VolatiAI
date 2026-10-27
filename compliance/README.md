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
