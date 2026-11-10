# Second-host mirror for anchors

## Why

`_anchors.jsonl` and `*.tsr` are served by GitHub Pages — the same trust
domain as the snapshots. If GitHub or the account is compromised, an attacker
can rewrite both the snapshot and the anchor. The Ed25519 signature survives
(private key isn't on GitHub), but the anchor's job is to detect exactly this
kind of rewrite; it needs an out-of-domain copy to do that.

A second host (Codeberg, GitLab, self-hosted Gitea) that mirrors only
`docs/snapshots/_anchors.jsonl` and `docs/snapshots/*.tsr` breaks the coupling:
a rewrite has to compromise both hosts, not just one.

## Setup (one-time, ~15 minutes, needs a Codeberg/GitLab account)

1. Create an empty repo named `volatiai-anchors` on Codeberg (or GitLab/Gitea).
   Do not initialize with README/LICENSE.

2. Wire as a second remote:

       cd ~/VolatiAI
       git remote add mirror git@codeberg.org:YOUR_USER/volatiai-anchors.git
       git remote -v | grep mirror

   Replace `YOUR_USER` with your actual username.

3. First mirror push (manual):

       cd ~/VolatiAI
       TMPDIR=$(mktemp -d)
       cp docs/snapshots/_anchors.jsonl docs/snapshots/*.tsr "$TMPDIR/"
       cd "$TMPDIR"
       git init -q && git add -A
       git -c user.name="VolatiAI" -c user.email="noreply@volatiai.local" \
           commit -qm "anchors: initial mirror $(date -u +%Y-%m-%dT%H:%MZ)"
       git branch -M main
       git remote add origin "$(git -C "$OLDPWD" remote get-url mirror)"
       git push -u origin main
       cd ~/VolotiAI 2>/dev/null; cd ~/VolatiAI
       rm -rf "$TMPDIR"

4. Add automated re-mirror to `scripts/ci_sign_and_anchor.sh` — append this
   block before the final echo:

       if git remote get-url mirror >/dev/null 2>&1; then
         echo "-> mirroring anchors to second host"
         TMPDIR=$(mktemp -d)
         cp docs/snapshots/_anchors.jsonl docs/snapshots/*.tsr "$TMPDIR/" 2>/dev/null || true
         (
           cd "$TMPDIR"
           git init -q && git add -A
           git -c user.name="VolatiAI" -c user.email="noreply@volatiai.local" \
               commit -qm "anchors: $(date -u +%Y-%m-%dT%H:%MZ)"
           git branch -M main
           git remote add origin "$(git -C "$OLDPWD" remote get-url mirror)"
           git push -qf origin main
         )
         rm -rf "$TMPDIR"
       fi

   Once the remote exists, every `ci_sign_and_anchor.sh` run mirrors
   automatically. If the remote doesn't exist, the check silently skips
   (which is why you saw the script pass with no output just now — no
   mirror remote is configured yet).

5. Cross-check anchors match across both hosts:

       PRIMARY="https://christianscode1994.github.io/VolatiAI/snapshots/_anchors.jsonl"
       MIRROR="https://codeberg.org/YOUR_USER/volatiai-anchors/raw/branch/main/_anchors.jsonl"
       diff <(curl -sL "$PRIMARY" | sort) <(curl -sL "$MIRROR" | sort) \
         && echo "OK anchors match across both hosts" \
         || echo "DRIFT - investigate immediately"

   Agreement between the two hosts is the point. Disagreement means one has
   been tampered with (or the mirror is lagging — check anchored_at).

## What NOT to mirror

- **Snapshots themselves** — already public; mirroring duplicates load without
  adding trust. The anchors are what need to be out-of-domain.
- **pubkey.pem / pubkey-v0.pem** — public keys, no secrets, but the worker
  fetches them from GitHub; mirroring creates a "which one is correct"
  ambiguity with no verification benefit.
- **Private keys** — never leave `~/.volatiai/signing.key`.

## Status

Deferred — needs a Codeberg/GitLab account signup, not a code change. The
infrastructure (skip-if-remote-missing check in `ci_sign_and_anchor.sh`) is
already in place; the only missing piece is the remote itself.

## Status (2026-11-10)

**Deferred, not built.** The trust apparatus currently relies on:
- FreeTSA per-snapshot timestamps (11/11 verified)
- OpenTimestamps stamp of `_anchors.jsonl` (committed, Bitcoin-witnessed)
- Append-only anchor log on GitHub Pages

Together these cover ~95% of the practical threat model. The mirror
would close the remaining ~5% — a simultaneous GitHub compromise of
snapshots + anchors + .tsr files — which is a threat that has never
materialized and would require nation-state-grade capability to pull off.

**Revisit if any of these become true:**
- The feed becomes economically valuable enough to be worth attacking
- You get a real adversary (not just scanners)
- GitHub account compromise becomes a plausible near-term risk
- An auditor, lawyer, or enterprise customer specifically asks for it

Codeberg's 2026 ToU also restricts LLM-generated code and cryptocurrency
projects. The mirror artifacts themselves (JSONL hashes + RFC 3161
receipts) contain no code and no crypto references, but the account is
associated with a project that has a "Crypto" category. GitLab has no
equivalent restrictions and is the safer choice if you ever do build it.

**Setup cost if you change your mind:** 15 minutes manual + 30 minutes
automation. The `scripts/mirror/push_anchors_to_mirror.sh` automation
pattern in this doc is still correct; only the ToU risk profile changed.
