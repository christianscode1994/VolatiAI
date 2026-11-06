# VolatiAI dev workflow

Operational runbook. Everything the previous session taught, in one place.

---

## Quick reference

    ./scripts/sweep.sh                 # double-hit sweep all 3 workers (~5 min)
    ./scripts/sweep.sh sparse          # one worker (faster)
    ./scripts/audit_sanity.py          # non-blocking warnings
    ./scripts/stub_report.py           # dead-code report
    ./scripts/cleanup_kv.sh            # dry-run orphan KV list
    ./scripts/cleanup_kv.sh --apply    # actually delete orphans

Sweep exit codes: 0 = clean, 1 = at least one sector failed twice in a row.
Transient (recovered) lines are normal noise - do not chase them.
A 400-sector sweep will show 1-5 transients; that is statistics, not regressions.
Only re-sweep after adding a sector or deploying.

---

## Adding a new sector

Mandatory order - do not skip step 1:

1. Probe from CF edge first:
       cd workers/sector-DENSITY && npx wrangler dev --remote

   Wait for Ready on http://localhost:8787. Leave the terminal alone.

2. In another terminal, after writing a draft collector:
       curl -s "http://localhost:8787/SECTOR_NAME" | jq .

   Watch the dev terminal for the fetch log.

3. If the fetch fails there:
   - HTTP 403/429/fetch failed: CF-egress blocked, do not ship
   - 200 but wrong shape: fix parser before committing

4. Add collector to workers/sector-DENSITY/src/index.js matching observed shape.

5. Add to all three metadata files:
   - config/active_sectors.json (array of sector names)
   - config/source_licenses.json (object with source, license, attribution)
   - docs/source_licenses.json (same content)

6. Rebuild attribution:
       python3 scripts/build_attribution.py

7. Commit - the gate runs 4 checks automatically.

8. Deploy + sweep:
       cd workers/sector-DENSITY && npx wrangler deploy
       cd ~/VolatiAI && ./scripts/sweep.sh DENSITY

If step 1 fails, do NOT proceed to 4-8.

---

## Dropping a dead sector

One-sector drop, 4 commands. Replace SECTOR and DENSITY.

1. Remove from worker:
       cd ~/VolatiAI && python3 -c 'import re;p="workers/sector-DENSITY/src/index.js";s=open(p).read();s2=re.sub(r"\n  \"SECTOR\": \{.*?\n  \},\n","\n",s,count=1,flags=re.S);assert len(s)-len(s2)>200,f"delta={len(s)-len(s2)}";open(p,"w").write(s2);print("dropped",len(s)-len(s2),"bytes")'

2. Syntax check:
       cd ~/VolatiAI && node --check workers/sector-DENSITY/src/index.js && echo OK

3. Remove from metadata:
       cd ~/VolatiAI && python3 -c 'import json;drops={"SECTOR"}
d=json.load(open("config/active_sectors.json"));b=len(d);d=[x for x in d if x not in drops];json.dump(d,open("config/active_sectors.json","w"),indent=2,ensure_ascii=False);open("config/active_sectors.json","a").write("\n");print(f"active: {b} -> {len(d)}")
for p in ["config/source_licenses.json","docs/source_licenses.json"]:
    d=json.load(open(p));b=len(d);[d.pop(k,None) for k in drops];json.dump(d,open(p,"w"),indent=2,ensure_ascii=False);open(p,"a").write("\n");print(f"{p}: {b} -> {len(d)}")'

4. Rebuild, commit, deploy:
       cd ~/VolatiAI && python3 scripts/build_attribution.py
       cd ~/VolatiAI && git add -A && git commit -m "revert(DENSITY): drop SECTOR (reason)"
       cd ~/VolatiAI && git pull --rebase origin main && git push origin main
       cd ~/VolatiAI/workers/sector-DENSITY && npx wrangler deploy

---

## What the safety gate blocks

.githooks/pre-commit runs before every commit:

- node --check per worker - blocks JS syntax errors
- Empty/invalid JSON - blocks truncated config/*.json, docs/*.json
- Duplicate collectors - blocks two definitions of the same sector key
- Empty collector body - blocks async collectAll(env) with no body

Test it any time:

    echo ']]]' >> workers/sector-sparse/src/index.js
    git add workers/sector-sparse/src/index.js
    git commit -m "TEST"
    # expect SYNTAX + commit blocked
    git reset HEAD -- .; git checkout HEAD -- workers/sector-sparse/src/index.js

---

## What the gate CANNOT catch - needs wrangler dev --remote

- CF-egress block (ffxiv, dockerhub, space-launches, computer-networks, grid-balance)
  Detect: probe first, look for 403/429 in dev terminal
- Upstream shape mismatch (thecalendar, ffxiv, nutrition-foods)
  Detect: console.error(JSON.stringify(j).slice(0,300)) in collector
- Structural rate limits (DEMO_KEY 30/hr, ll.thespacedevs.com 15/hr)
  Detect: recognise the URL pattern, do not ship

The gate protects syntax/config. Only wrangler dev --remote protects against
"URL looks fine but CF cannot reach it".

---

## Common failure signatures during sweeps

- healthy:1 cached, 0 on ?bust= -> TTL cache shows stale success -> usually transient
- healthy:1 in sweep, 0 on recheck -> transient upstream -> ignore
- healthy:0 on both, local curl 200 -> CF-egress block -> DROP
- healthy:0 on both, local curl 500/timeout -> upstream dead -> DROP
- healthy:0 + body has DEMO_KEY or X/hr -> structural rate limit -> DROP
- 3+ sweeps in a row, same sector fails -> real bug -> diagnose

---

## Git recovery traps

Trap 1: git checkout -- . reverts uncommitted work.
Never use while testing. Safe form: git checkout HEAD -- FILE.

Trap 2: git checkout HEAD -- file restores a bad state.
If HEAD itself is broken, use: git checkout GOOD_SHA -- FILE.

Trap 3: git reset --hard destroys uncommitted changes.
Only when working tree is clean.

Trap 4: rebase conflicts on files you already committed.
Safer: git fetch origin && git reset --hard origin/main,
then git checkout LOCAL_SHA -- FILE, commit, push.

Trap 5: re.sub(pattern, replacement) with backslash in replacement.
Use lambda: pat.sub(lambda m: NEW + "\n", old, count=1)

---

## KV namespace

- _last_cron_run and _last_publish_hash are system keys - never delete
- Every other key is per-sector state; safe to delete when sector not in active_sectors.json
- cleanup_kv.sh shows orphans; --apply deletes them

---

## Known issue: docs/intel.json gets corrupted by the snapshot job

`ebeed79f Update intel snapshot` writes `error code: 1042` (17 bytes) to
docs/intel.json when the wrangler KV fetch fails. This has happened at least
twice (commits 201cec34 and ebeed79f).

Symptom: safety gate fails with "INVALID JSON: docs/intel.json".
Fix: git show <last-good-sha>:docs/intel.json > docs/intel.json
Last-good-sha as of 2026-10-29: a0255ab1 (214 bytes, valid)

Prevention (todo): the snapshot job should not overwrite docs/intel.json
unless the fetch succeeded and content is valid JSON.

---

## Known issue: unquoted sector keys

Single-word sector names in the worker file (e.g. `diseases:`, `research:`)
appear WITHOUT quotes in the JS object literal. Two-word and hyphenated names
(e.g. `"cyber-threats":`) appear WITH quotes.

Any drop/rename regex must handle both forms:

    r'\n  "?' + re.escape(name) + r'"?\: \{.*?\n  \},\n'

Forgetting the `"?` on both sides means `re.sub` returns delta=0 and silently
does nothing — the sector stays, `grep` still finds it, and you'll spend
another round chasing "why didn't the drop work".

## Known issue: diagnostic block-parser false positives

An earlier session's ghoapi sector finder used:

    end = ms[i+1].start() if i+1 < len(ms) else s.find("^};", m.end())

`str.find("^};")` searches for the LITERAL string `^};` — the caret is not a
metacharacter in `str.find`. It returns `-1` (not found), so the code falls
back to `end = len(s)`, making the last block extend to EOF. Result: sectors
AFTER the real ghoapi block are falsely attributed as the ghoapi sector.

Fix: use `re.search(r'^\};', ...)` or `s.rfind("};")`, or the simpler:

    end = ms[i+1].start() if i+1 < len(ms) else len(s)

The bug caused `energy-carbon` (real carbonintensity.org.uk collector) to be
dropped as "ghoapi" in 2026-10-29, then restored in commit `966ef6b6`.

---

## Known issue: cleanup_kv.sh blocked by Cloudflare daily quota

Cloudflare Free tier caps `kv:key:list` calls per day. Repeated dry-runs during
cleanup work (e.g. 2026-10-29 ghoapi sweep) exhaust the quota. Symptom:

    your account has reached the free usage limit for this operation for
    today [code: 10048]

Not an auth issue, not a script bug. Wait until UTC midnight (or 24h from
first call) then retry. Reduce dry-runs during active cleanup to preserve
quota.

## BenchGecko — verified nonexistent (2026-10-29)

All 5 API endpoints and root domain returned 000 (DNS fail). Domain does not
resolve. Do not attempt `ai-model-benchmarks` from BenchGecko. If AI benchmark
coverage becomes a goal, source must be found elsewhere.

---

## Never do these

- git add -A when unsure what is staged - use explicit file paths
- git checkout -- . while testing
- git push --force to origin/main
- cleanup_kv.sh --apply without reading the list first
- Chase sweep transients - 3+ consecutive fails only
- Skip wrangler dev --remote on a new sector because URL works locally
- Paste comment blocks into a running wrangler dev terminal (reads as keypresses)
- Paste heredocs longer than ~60 lines at once (gets truncated)

---

## Runbook failure mode

If something breaks that is not covered here, stop, diagnose, then add the trap to this file.
The runbook only stays useful if it grows with actual failures.
