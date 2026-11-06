# VolatiAI

Correlation analysis of public-domain data. Every claim carries its own uncertainty.

Live: https://christianscode1994.github.io/VolatiAI/

## What it does

VolatiAI collects ~500 sector time-series from public-domain sources (US government, EU open data, CC0), computes pairwise correlations on detrended residuals, and reports every claim with:

- p-value and Benjamini-Hochberg adjusted p
- Permutation p (assumption-free)
- Fisher 95% CI on the correlation coefficient
- Provenance classification (same-quantity vs. cross-sector insight)
- Stability score across days
- Named verdict: confirm:provenance, surface, suppress:*, dispute:*

When the system cannot verify something, it returns that fact explicitly (empty transitivity, empty drifts, no_evidence verdicts). Empty results are information, not absence.

## Live endpoints

- Dashboard: https://christianscode1994.github.io/VolatiAI/
- Methodology: https://christianscode1994.github.io/VolatiAI/methodology.html
- API docs: https://christianscode1994.github.io/VolatiAI/api.html
- Live JSON: https://sector-slow.fourieranalys.workers.dev/_correlation
- Pipeline health: https://sector-slow.fourieranalys.workers.dev/health?full=1

## Repository layout

workers/sector-slow/src/  — Worker source (Cloudflare Workers)
  index.js               — Collectors, endpoints, statistical honesty layer
  arbitration.js         — Pure statistical functions (pearson, detrend, arbitrate)

scripts/                 — Data pipeline
  briefing.py            — Generates docs/briefing.json from /signal data
  find_candidates.py     — Provenance candidate detection

tests/                   — Unit tests (Python + Node)
  test_briefing.py       — 17 tests
  test_find_candidates.py — 10 tests
  arbitration.mjs        — 20 tests
  correlation_pvalue.mjs — 6 tests documenting correlationPValue behavior

docs/                    — Static site (GitHub Pages)
  index.html             — Dashboard
  methodology.html       — Field-by-field explanation
  api.html               — Interactive API reference

config/                  — Registries
  active_sectors.json    — Sector registry
  semantic_registry.json — Same-quantity groups
  provenance.json        — Per-sector attribution

## Running tests

    python3 tests/test_briefing.py
    python3 tests/test_find_candidates.py
    node tests/arbitration.mjs
    node tests/correlation_pvalue.mjs

## Design principles

1. Honest empty results. When there is nothing to report, say so explicitly.
2. Public domain only. Every data source is US government, EU open data, CC0, or CC-BY.
3. Multiple-testing correction is mandatory. BH-FDR at q=0.05 is the floor.
4. Provenance is a control, not an insight. Same-quantity pairs validate the pipeline.
5. Log-rate, not raw percentage. Window length should not distort comparisons.

## Status

- Worker: deployed with 5 cron shards (03:17-03:57 UTC daily)
- Tests: 105 across 8 files, all passing locally
- Snapshot signing: Ed25519 module ready (`workers/sector-slow/src/signing.js`) with 15/15 tests. Wiring Nov 8 (needs 3+ days of cron data). Verification: `scripts/verify_signature.py`
