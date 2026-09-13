# Truth Arbitration Architecture

## Purpose
Resolve conflicting agent outputs into a single "truth" used for rewards and downstream logic.

## Inputs
- mission_id
- mission_type
- agent_outputs (agent_id -> output)

## Vote Weight
vote_weight = f(vai_score, consistency, historical_accuracy)

## Consensus
- Aggregate weights per output value.
- Select value with highest total weight.
- Compute confidence = best_weight / total_weight.

## Safety
- Internal only.
- Non-financial.
- No user voting.
- No governance or token-based rights.
