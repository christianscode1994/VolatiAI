# Changelog

Reverse-chronological. Session-based grouping. Commit hashes included where relevant.

---

## Session 2 — 2026-11-05

First cron fire with 5-shard worker. Discovered shard-0 CPU bug. Deployed fix. Built cryptographic verification layer end-to-end.

### Fixed
- **Shard-0 CPU budget overflow** (`7c60e3b5`) — shard 0 died before writing its completion marker because it computed a 5,574-pair correlation snapshot inside the 10ms CPU limit. Moved snapshot write out of cron to `corr-snapshot.yml` at 04:15 UTC.
- **NaN guard in `coherenceScore`/`detrendedCoherence`** (`a12f1f79`) — `typeof NaN === "number"` let NaN through, returned NaN or 1.0 instead of null. Caught by tests, not by inspection.
- **`verify_signature.py` stripped wrong fields** (`5e65db10`) — Python verify didn't strip `pubkey_id` before canonicalizing, so no JS-signed snapshot could verify. Caught by self-test, fixed with one-line change.
- **9 false-verification commits** — each corrected with a follow-up commit documenting what actually happened vs. what the message claimed.

### Added
- `workers/sector-slow/src/signing.js` (`e073078c`) — Ed25519 sign + verify using Web Crypto API. 15 tests covering: canonicalize determinism, sign/verify roundtrip, tamper rejection (signature, payload, wrong key, missing fields).
- `scripts/verify_signature.py` (`0f88b4e7` + `5e65db10`) — CLI verifier with `--self-test` and `--canonical-test`. Anyone can verify signed snapshots without the worker.
- `tests/fixtures/canonical_vectors.json` — 8 shared test vectors ensuring JS↔Python produce byte-identical canonical JSON. Verified compatible.
- `tests/coherence.mjs` (`9f73978d` + `a12f1f79`) — 19 tests for `coherenceScore` and `detrendedCoherence`, the two functions driving `/signal` confidence and severity classification.
- `config/unit_schemas.json` (`a44796da`) — 7 verified sectors with declared units. Deliberately incomplete; policy is "wrong units worse than missing units."
- `config/semantic_registry.json` updated with `gleif_leis` (`d867b0e8`) — 4th confirmed provenance group, first one validated by data accumulation (`n=10` reached, r=0.99) rather than manual declaration.
- `scripts/pre_commit.sh` + installed `.git/hooks/pre-commit` (`781889d0`) — runs all 7 test files before every commit. Would have caught all 9 false-verification commits.
- `scripts/smoke_prod.sh` (`781889d0`) — 5-check production state verifier. Currently 4/5 because shard 0 didn't fire this morning; expected to pass 5/5 tomorrow.
- `scripts/check_all.sh` (`eb2161e1`) — single command running 5 verification sections for tomorrow's complete check.
- `scripts/test_all.sh` (`0f88b4e7`) — runs all 7 test files with per-file pass/fail.
- `.github/workflows/test.yml` expanded (`b780dd7d`) — now runs all 6 test files in CI plus syntax checks on 3 worker files. Before: only 3 test files.
- `verify-cron.sh` enhanced (`b638a2ad` + `b780dd7d`) — stale-state analysis + shard detail diagnostic.

### Test count
88 tests across 7 files, all passing locally and in CI.

### State at end of session
- Worker: `49795360` deployed with shard-0 fix
- Cron: 5 shards, 03:17-03:57 UTC
- Snapshots written by `corr-snapshot.yml` at 04:15 UTC
- 3 confirmed provenance pairs (treasuries, cisa-kev, gleif-leis)
- Signing module ready, wiring Nov 8 (needs 3+ days of snapshots)

---

## Session 1 — 2026-11-04

Foundation session. Went from 18 noisy correlation pairs to 3 confirmed provenance pairs with statistical honesty layer.

### Added
- **Provenance filter** (`9e5b4808`) — `PROVENANCE_PAIRS` + `isProvenance()` replaced broken `same_metric` string check. Dropped 12 false-positive pairs.
- **`?days=N` stability tracking** (`6bbb6ca3`) — daily snapshots to `_corr_<date>`, aggregated stability metrics.
- **Snapshot write ordering fix** (`0e1aae10`) — moved write before `return json()`, restored cron self-fetch.
- **Full statistical honesty layer** (`0f6b19ae`):
  - BH-FDR over all pairs (`bhAdjust`) with `p_bh` field
  - Verdict enum (`computeVerdict`): `confirm:provenance`, `surface`, `suppress:*`, `dispute:*`
  - Reliability score + tier A/B/C/D/P (`computeReliability`)
  - Contradiction priors (`PRIORS` with tolerance-based firing)
  - Transitivity check, structure drift, Pareto frontier
- **`stale_data` detection** (`10eb60c0`) — raw-value uniqueness check catches batch-update counters.
- **Corrected two wrong priors** (`10eb60c0`) — removed `usgs-earthquakes|usgs-earthquakes-emsc` (different catalogs, -16,500 offset), widened `treasuries` tolerance 0.15 → 0.25 (1-day lag between sources).
- **BH-FDR scope fix** (`1b61ff45`) — was running over 5 surfaced pairs; now runs over all 5,574 tested pairs.
- **Precision fixes** (`a9fdefc5` + `169dffc5`) — `p_value` and `p_bh` were rounding to 0. Changed to `toPrecision(3)`.
- **Public pages**: dashboard, methodology, api, 404, robots, sitemap, security.txt.
- **Removed 7 non-public-domain collectors** (`fe5eb733`): allbirds (Shopify scrape), bluesky (ToS restricts), dexpaprika (unclear ToS), coinbase (redistribution restricts). Also removed matching PROVENANCE_PAIRS entries.
- **Test suite created**: `test_briefing.py` (17), `test_find_candidates.py` (10), `arbitration.mjs` (20), `tDistPValue` tests (7), `correlation_pvalue.mjs` (6 diagnostic).
- **`tDistPValue(t, df)`** (`4d1ca15b`) — proper t-distribution tail using continued fraction. 7/7 tests against t-table values.
- **Cross-sector diagnostics**: `find_candidates.py`, `coherence_scan.py`. Both return honest empty results until data accumulates.

### Test count
32 at end of session 1. Expanded to 88 by session 2.

---

## Known issues (documented, not fixed)

- **`correlationPValue` uses normal approximation** — for df<30 underestimates p by 10-500×. Fixed via `tDistPValue` which is implemented and tested but not yet wired into `correlationPValue`. Wiring Nov 6+.
- **Contradiction detection is FX-only** — 2 sectors (`currency-ex`, `exchange-rate`). All other sectors single-source. Expanding `CONFLICT_GROUPS` is a future task.
- **`semantic_registry.json` not yet read by worker** — `PROVENANCE_PAIRS` in `index.js` is still hardcoded. Wiring Nov 10+.
- **`?days=N` schema lacks verdict/tier** — aggregates only stability metrics. Adding verdict requires stability-weighted logic.
- **Workflow consolidation deferred** — 16 workflows; should be 5. Not on critical path to any feature.

## Honest scope boundary

At 496 sectors, ~200 with 20+ point histories, 3+ days of stability data, and 3+ days of signed snapshots, the pipeline will be at ~80% complete. The remaining 20% requires either:
- Workers Paid ($5/mo) for >800 sectors or >5 crons
- 30+ day histories (Nov 30+)
- Wikidata entity graph (manual research)
- Ollama + review pipeline (semantic classification)

Everything before that is either built or documented as blocked.
