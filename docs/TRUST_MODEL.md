# VolatiAI trust model

How VolatiAI computes a **trust score** for a signal. This is a specific,
documented, testable model — not a universal theory of trust. Every
assumption is stated explicitly so it can be falsified or revised.

Code: `scripts/mirror/compute_trust_scores.py`
Feeds: `docs/active_with_trust.json` (also exposed via `list_active_signals`)

## What "trust" means here

A trust score answers one question: **"How much should a rational consumer
update their beliefs about a claim based on this signal?"**

It is *not* "how important is this signal" (existing severity × confidence ×
magnitude × novelty score) and not "how likely is this signal to be true"
(needs the accuracy tracker, not yet built). It is a **meta-signal** about
weighting: given the signal exists, how much attention does it warrant?

## The four inputs

    score = w1·independence + w2·attribution + w3·historical + w4·freshness

| Weight | Value | Rationale |
|---|---|---|
| w1 independence | 0.4 | Independent cross-reference is the strongest signal |
| w2 attribution | 0.3 | Without a source, a signal is an assertion |
| w3 historical | 0.2 | Past accuracy predicts future accuracy imperfectly |
| w4 freshness | 0.1 | Older signals have lower informational value |

These weights are wrong. They will always be wrong. The point is they are
*written down*, so when they produce a wrong score, we can identify which
weight to adjust rather than guessing.

## Input 1 — independence

A signal is *independent* if other sectors corroborate it **without sharing
upstream data sources**. Two crypto exchanges reporting BTC price are not
independent (both reflect the same market). A crypto exchange and a news
outlet reporting the same BTC price are independent — one is direct
observation, the other a report.

Currently: `independence = min(1.0, independent_corroborating_sectors / 3)`.
Three independent sectors agree → 1.0. One sector alone → 0.333.

**TODO:** each sector should declare `upstream_feeds` so independence can be
computed properly. Until then, the placeholder 0.333 is applied to all signals.

## Input 2 — attribution

Signals come with `attribution_url`. The quality of that URL is a proxy for
how seriously the signal was sourced.

| Attribution type | Score | Example |
|---|---|---|
| Direct API to primary source | 1.0 | `https://api.kraken.com/...` |
| Published dataset with permalink | 0.85 | `https://data.nist.gov/...` |
| Named-entity URL | 0.7 | `https://en.wikipedia.org/wiki/Bitcoin` |
| Major news outlet | 0.5 | `https://reuters.com/...` |
| Blog / aggregator | 0.3 | `https://medium.com/...` |
| Unknown | 0.4 | (fetches OK but no class match) |
| Undefined / broken | 0.0 | (fetch fails, or 404) |

**Current state:** attribution URLs in `active.json` point at
`attribution.json` (an aggregator) rather than source APIs. This is the
main data-quality gap in the current implementation — all signals score 0.4
attribution regardless of source quality. Fixing this means changing
`active_signals.py` to preserve source URLs into the `attribution` field.

## Input 3 — historical accuracy

Requires the accuracy tracker (`docs/ACCURACY.md`, not yet written).
Until then, all signals get a neutral 0.5 (no information either way).

Once available, per-sector accuracy over the last N days, capped to [0.1, 1.0]
so a single bad stretch doesn't zero out a sector.

## Input 4 — freshness

    freshness = exp(-age_hours / 24)

6 hours old → 0.78. 3 days → 0.05. Signals don't vanish, they get less weight.

## Worked example

Signal: `btc-exchange-spread 0.08% alert`

- Independence: 1 corroborating sector → 1/3 = 0.333
- Attribution: (all signals currently 0.4 because of attribution.json issue)
- Historical: Unknown → 0.5
- Freshness: 2 hours old → exp(-2/24) = 0.92

    score = 0.4·0.333 + 0.3·0.4 + 0.2·0.5 + 0.1·0.92
          = 0.133 + 0.12 + 0.10 + 0.092
          = 0.445

That's roughly the ceiling for currently-obtainable scores. **To move signals
above ~0.45, the two data-quality fixes are needed:** proper attribution URLs
and declared upstream feeds.

## What this model explicitly does NOT do

- **Recursive propagation.** VolatiAI doesn't have sectors vouching for other
  sectors. When it does, add a fifth term for "trusted by N other trusted
  sectors" and revisit.
- **Adversarial resistance.** Assumes sectors are honest but sometimes wrong.
  Does not resist a coordinated attack where 10 fake sectors claim the same
  false thing. That requires sector identity, a separate problem.
- **Bayesian updating.** Produces a "weight" not a "probability." Consumers
  wanting Bayesian updating should use this as the likelihood term; that's
  their decision.

## Roadmap

1. ✅ Ship this model — `compute_trust_scores.py` computes per-signal trust
2. ⏳ Instrument — record the four inputs so bad scores can be traced back
3. ⏳ Iterate on weights — every 30 days, review high-trust predictions,
   adjust weights, publish the change
4. ⏳ Add independence metadata — declare `upstream_feeds` for top 10 sectors
5. ⏳ Build accuracy tracker — `docs/ACCURACY.md`. This is the input the
   trust model most needs and doesn't have.

## Versioning

    version: 1
    weights: {independence: 0.4, attribution: 0.3, historical: 0.2, freshness: 0.1}

Every weight change bumps the version and adds a note here explaining why.
Without version history, a bad score 6 months from now is untraceable.
