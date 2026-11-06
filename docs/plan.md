# Plan — verifier per item

Each item has a **VERIFY** command whose output is the definition of
"done." If you can't name the verifier, you can't claim the item.

Status legend: ✅ done, ⏳ waiting, 🔓 unblocked, 🔒 blocked

---

## Gate 0 — CI green on HEAD (✅ passed Nov 5)

VERIFY:
  SHA=$(git rev-parse HEAD)
  gh run list --workflow=test.yml --limit 20 --json conclusion,headSha \
    | python3 -c "
import json, sys
for r in json.load(sys.stdin):
    if r['headSha'] == '$SHA' and r['conclusion']:
        print(r['conclusion']); break"

GATE: output == "success"

---

## Gate 1 — seen: 5 (⏳ Nov 6 afternoon)

Nov 5: seen: 4 (correct — shard 0's CPU-budget fix went live 09:00 UTC)
Nov 6: expect seen: 5 if shard 0 fires at 03:57 UTC

VERIFY:
  ./verify-cron.sh 2>&1 | grep -E '"seen"|"expected"|Shard detail'
  # Expect: "seen": 5, "expected": 5, all 5 shard indices listed

GATE: seen == 5 AND failed == 0

SLIP CONDITIONS:
  - seen: 4 again → CPU fix wasn't the fix; different cause
  - seen: 0 → cron didn't fire at all; different bug
  - failed > 0 → real failure rate, not a shard gap

---

## 2a — Volatility field (🔓 unblocked, gate 0 passed)

Adds a `volatility` field to pair output. Additive, no schema break.

VERIFY:
  ./scripts/test_all.sh 2>&1 | tail -3
  # Expect: Files passed: 8 (or higher), Files failed: 0

  # And the field is present in live output:
  curl -s "https://sector-slow.fourieranalys.workers.dev/_correlation?days=1" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('volatility' in d['pairs'][0])"
  # Expect: True

GATE: test_all green AND live output has the field

---

## 2b — t-dist on residuals (🔓 unblocked, no fixed date)

The "documented failure" in correlation_pvalue.mjs. Real research.

VERIFY:
  node tests/correlation_pvalue.mjs 2>&1 | grep -E 'Pass:|Fail:|documented'
  # Expect: Fail: 0 (currently has 1 documented failure)

GATE: the 1 documented failure is resolved, not bypassed

---

## 2c — Signing + chain wired (🔒 blocked, Nov 8)

Needs 3 cron days: Nov 5, 6, 7. Verify on Nov 8.

VERIFY:
  # 1. Fetch signed snapshot
  curl -s "https://sector-slow.fourieranalys.workers.dev/_corr_$(date -u +%Y-%m-%d)" \
    > /tmp/snap.json

  # 2. Verify signature
  python3 scripts/verify_signature.py /tmp/snap.json <pubkey-path>
  # Expect: "valid, pubkey_id=...", exit 0

  # 3. Verify chain — the verifier must exist by Nov 8
  # (either extend verify_signature.py with --chain, or new script)
  # If it doesn't exist yet, this is a gap to close before Nov 8.

GATE: signature valid AND chain valid AND verifiers exist in repo

---

## 3a — Antichains (🔓 unblocked)

Partial-order fixtures → expected verdicts. No external dependency.

VERIFY:
  node tests/antichains.mjs
  # Expect: all fixtures pass, none documented as failing

  # And integrated into test_all.sh:
  ./scripts/test_all.sh 2>&1 | grep -c antichains
  # Expect: 1

GATE: tests pass AND are in test_all.sh

---

## 3b — Entity QIDs (🔓 unblocked, manual research)

Resolve sector names to Wikidata QIDs.

VERIFY:
  python3 scripts/resolve_entities.py --test-set 2>&1 | tail -5
  # Expect: "resolved: N/M" where N/M is the defined coverage target

GATE: coverage target met, not just "runs"

---

## 3c — Ollama classification (🔓 unblocked, local infra)

Classify sectors via local LLM.

VERIFY:
  ollama run <model> "classify: <test-input>" 2>&1 | tail -3
  # Expect: valid label matching the schema's verdict enum

GATE: K samples reviewed manually, agreement > threshold

---

## 4 — Workflow consolidation (🔒 blocked, Nov 8+)

16 workflows → 5. Nothing on the critical path.

VERIFY:
  ls .github/workflows/*.yml | wc -l
  # Expect: target count (5 or as decided)

  gh run list --limit 5 --json conclusion,name
  # Expect: all success, no duplicate workflows

GATE: reduced count AND all workflows still green

---

## Force-push policy

CI auto-commits docs/*.json on every push to main.
Force-pushing to main will clobber the last docs regeneration — harmless
(after the next normal push it regenerates), but stop using
`--force-with-lease` on main once the history-rewrite phase is over.

Normal workflow from here:
  git pull --rebase origin main
  <edit>
  ./scripts/safe_commit.sh /tmp/msg.txt <files>
  git push origin main

## Guard: message nouns vs staged files

Before every commit, verify that every noun in the commit message
corresponds to a file or command that actually changed:

    git diff --cached --name-only
    # Re-read the message: does every file it names appear above?

def4b3d1 was the case that revealed this gap. Message claimed
"test_all.sh and CI", staging showed only test.yml. Fixed in b25d2ae0.
