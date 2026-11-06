# Roadmap

Current state, what's next, and what's blocked on what.

**Last updated:** 2026-11-05

## Completed

- **Worker deployed:** `49795360-b420-4d0c-ba33-8f66a9e6f439` (Cloudflare Workers Free tier)
- **Cron:** 5 shards, 03:17-03:57 UTC daily. Shard-0 CPU-budget fix deployed Nov 5.
- **Snapshot workflow:** `corr-snapshot.yml` fires at 04:15 UTC daily, external trigger
- **Provenance:** 3 confirmed pairs
  - `treasuries ↔ treasuries-gov` (manual)
  - `cisa-kev-count ↔ cisa-kev-total` (manual)
  - `gleif-leis ↔ gleif-total-leis` (data-driven, confirmed Nov 5)
- **Statistical layer:** BH-FDR, log-rate ranking, permutation p, Fisher CIs, verdict enum, reliability tiers
- **Contradiction detection:** FX-only (2 sectors), tolerance-based
- **Stale-data detection:** Batch-update artifact detection
- **Signing:** Ed25519 module ready (`signing.js` + `signing.mjs`, 15 tests). Not yet wired.
- **Public pages:** dashboard, methodology, api, 404, robots, sitemap, security.txt
- **Tests:** 88 across 6 files (briefing: 17, find_candidates: 10, arbitration: 20, coherence: 19, tdist: 7, signing: 15)
- **Diagnostic tools:** find_candidates.py, coherence_scan.py, verify-cron.sh, verify_signature.py, test_all.sh
- **Configs:** semantic_registry.json (4 groups), unit_schemas.json (7 sectors)
- **CI workflows:** test.yml green, pages.yml green, corr-snapshot.yml ready

## Blocked on `shards.seen: 5` (Nov 6 04:30 UTC)

The shard-0 CPU-budget fix was deployed Nov 5. First fire with fix: Nov 6 03:17 UTC.
Until tomorrow's `verify-cron.sh` shows `seen: 5`, all worker changes are risky.

Once `seen: 5` confirmed:

1. **Wire `tDistPValue` into `correlationPValue`** — 10 min
   - Currently `correlationPValue` uses normal approximation
   - `tDistPValue(t, df)` is already implemented + tested (7/7)
   - One-line swap in `index.js`

2. **Add `volatility` field to `/signal`** — 15 min
   - Compute stddev of historical daily log-returns
   - Include in response
   - Enables true z-score filtering in briefing

3. **Deploy** — 5 min, verify

## Blocked on 3+ days of cron data (Nov 8+)

- **Wire signing into snapshot write** — 30 min
  - Call `signSnapshot` after `_corr_<date>` write
  - Add `/.well-known/volatiai-pubkey.pem` endpoint
  - Verify chain works end-to-end
  - Prerequisites: Nov 6, Nov 7, Nov 8 snapshots exist (chain has 3 links)

- **Test `verify_signature.py` against real signed snapshot** — 5 min
  - Fetch signed snapshot from worker
  - Run `python3 scripts/verify_signature.py snapshot.json pubkey.pem`
  - Should print "✓ VALID"
  - Tamper with a field, verify it prints "✗ INVALID: signature_mismatch"

## Blocked on 3+ days of stability variation (Nov 8+)

- **Antichain logic** — 45 min
  - Currently every pair has `stability_pct: 100` or `50`
  - Need `stability_pct` values spread across range (e.g. 66, 83, 90)
  - Then antichain = pairs not dominated by another on all axes
  - Meaningful output requires variance

- **Update methodology with drift section** — 15 min
  - Document `drifts[]` with real values

## Blocked on 20+ point histories (Nov 15+)

- **`find_candidates.py` produces real candidates**
  - Currently 0 sectors with >=20 points
  - After 3 weeks of cron: ~200 sectors pass threshold
  - Output feeds manual review → `PROVENANCE_PAIRS` expansion

- **`coherence_scan.py` produces real anomaly rankings**
  - Same blocker
  - Cross-sector view of "who's most anomalous today"

## Blocked on manual research (Nov 10+)

- **`entity_ids.json` — Wikidata QID mapping**
  - 20 confirmed sectors → 20 QIDs
  - Each QID verified by reading Wikidata page
  - Manual work, not automatable without LLM

- **Expand `unit_schemas.json`** — 5-10 sectors/week
  - Only declare units you've verified from source docs
  - Policy: wrong units are worse than missing units

## Blocked on infrastructure (Nov 15+)

- **Ollama semantic classifier**
  - `ollama pull llama3.2` (or similar 3B model)
  - Script to suggest entity equivalences for manual review
  - Setup: 4 hrs
  - Review: ongoing
  - Value: real when `find_candidates.py` produces >20 candidates/run

## Not blocked, deferred by design

- **Workflow consolidation (16 → 5)** — 2-3 hrs
  - Reduces CI races, cleaner
  - Not on critical path to any feature
  - Do when there's a quiet afternoon, after Nov 6 baseline

- **`correlationPValue` is approximate on fat-tailed residuals**
  - Documented in `correlation_pvalue.mjs` as "1 documented failure"
  - Fix requires t-distribution on residuals, not raw values
  - Non-trivial research task, low priority
  - Currently: perm_p provides an assumption-free backup

## The honest ceiling

At 496 sectors, ~200 with 20+ point histories, 3+ days of stability data, 3+ days of signed snapshots, the pipeline would be at ~80% complete. The remaining 20%:

- 1000+ sectors (needs Workers Paid or architectural change)
- 30+ day histories for meaningful stability (Nov 30+)
- Entity resolution at scale (needs Wikidata graph)
- Semantic classification at scale (needs Ollama + review pipeline)

The project's honest position: **small, statistically rigorous, provenance-first, cryptographically verifiable, public-domain-only.** Everything past 80% requires either paid infrastructure or multi-month data accumulation.
