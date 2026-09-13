# Reward Engine Architecture

## Purpose
The reward engine evaluates mission results and adjusts agent VAI-INT scores.

## Inputs
- MissionSpec
- Agent outputs
- Arbitration truth

## Outputs
- Updated VAI-INT balances
- Ledger entries

## Reward Formula
delta = 10 * accuracy + 5 * consistency - 2 * (1 - timeliness)

## Safety
- Internal only
- Non-financial
- No user balances
- No redemption or transfer
