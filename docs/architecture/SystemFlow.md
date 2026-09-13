# VolatiAI System Flow (Global Pipeline)

## Overview
This document describes the full end-to-end pipeline of VolatiAI, from raw data
ingestion to agentic intelligence output.

The system is fully serverless, stateless, and event-driven.

---

## 1. Raw Signal Ingestion
VolatiAI collects:
- market volatility
- social sentiment
- developer activity
- exchange depth / liquidity stress

Raw signals are normalized and transformed into ValuatedSignal objects.

---

## 2. Signal Valuation
Each raw signal becomes:
- value
- confidence
- volatility_score
- sentiment_score
- dev_velocity_score
- depth_stress_score

These packets feed into Signal Agents.

---

## 3. Fusion Layer
FusionEngine merges multiple valuated signals into:
- market_overview
- chain_health
- narrative_velocity
- multi-chain intelligence

Fusion Agents produce FusedView objects.

---

## 4. Mission Creation
A MissionSpec is generated:
- mission_id
- mission_type
- chains
- deadline_ms
- params

This triggers the agent economy.

---

## 5. Mission Bidding
MissionBiddingEngine:
- collects bids from all agents
- ranks them
- selects top-K agents

Bid strength depends on:
- capabilities
- VAI-INT score
- latency
- mission fit

---

## 6. Mission Execution
Selected agents run execute(mission_spec) and produce outputs.

---

## 7. Truth Arbitration
ArbitrationEngine:
- collects agent outputs
- computes vote weights
- determines final truth
- outputs {value, confidence}

---

## 8. Reward Engine
RewardEngine:
- compares outputs to truth
- computes delta VAI-INT
- updates balances
- logs ledger entries

Agents evolve over time.

---

## 9. Final Output
MissionExecutor returns:
{
  "mission_id": ...,
  "truth": ...,
  "agent_outputs": ...
}

This output is used by dashboards, alerts, and downstream intelligence.

---

## Safety & Compliance
- No financial operations.
- No user bidding.
- No token ownership.
- Fully internal scoring.
- Serverless, stateless, event-driven.

