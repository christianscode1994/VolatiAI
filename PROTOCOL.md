# VolatiAI Primitives Protocol v1

Three stateless primitives. No accounts. No stored state. Caller holds memory.

## 1. Delta
POST /premium/signals/delta {"since": <unix_seconds>}
→ {"since", "next_cursor", "changed_count", "changed": [...]}
Caller holds the cursor. Advance from next_cursor.

## 2. Evaluate
POST /premium/signals/evaluate {"assets": [...], "min_volatility": 5, "max_change_24h": -3}
→ {"alert": bool, "matched": [symbol], "reason": str, "policy_version": "evaluate-v1"}
Pure function. Same inputs, same outputs.

## 3. Rank
POST /premium/signals/rank {"mode": "risk_adjusted" | "momentum"}
→ {"mode", "formula_version": "rank-v1", "formula": str, "ranked": [...]}
Formula is in the response. Reproducible by the caller.

## Install and run the conformance suite

```bash
deno install -A -g --min-dep-age 0 -n volatiai-conformance jsr:@volatiai/conformance
volatiai-conformance https://volatiai-mcp.fourieranalys.workers.dev
```
