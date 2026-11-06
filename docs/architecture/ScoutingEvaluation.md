# Scouting & Evaluation Layer

## Purpose
Provide ranked evaluations of chains, ecosystems, and narratives based on
multi-signal intelligence (volatility, sentiment, dev activity, depth).

## Inputs
- ValuatedSignal per chain/narrative
- Optional FusedView
- ScoutingSpec (focus_type, targets, params)
- EvaluationProfile (weights)

## Output
- Ranked list of targets: [(target, score)] descending

## Usage
- Identify top chains to watch
- Detect emerging ecosystems
- Prioritize narratives for deeper missions

## Safety
- Internal only
- Non-financial
- No user-facing "investment advice"
- Pure intelligence scoring
