# Fusion Engine Architecture

## Purpose
The Fusion Engine combines multiple ValuatedSignal objects into a unified, weighted intelligence view.
It is used by Fusion Agents and Mission Agents to produce higher-level insights from raw signals.

## Inputs
- List of ValuatedSignal objects
- view_type (e.g., "market_overview", "chain_health")

Each ValuatedSignal contains:
- chain
- signal_type
- value
- confidence
- volatility_score
- sentiment_score
- dev_velocity_score
- depth_stress_score

## Core Logic
Fusion is performed using a weighted average based on signal confidence:

fused_value = Σ(value_i * confidence_i) / Σ(confidence_i)

fused_confidence = Σ(confidence_i) / N

Where:
- N = number of signals
- confidence_i = normalized confidence score of each signal

## Output
A FusedView object containing:
- chains: list of chains represented in the fused signals
- view_type: type of fused intelligence
- value: weighted fused value
- confidence: normalized fused confidence

## Serverless Compatibility
- Pure functions
- Stateless execution
- No persistent memory
- Works with any DB/KV backend

## Safety
- Internal only
- Non-financial
- Not exposed to users
- No token or monetary semantics
