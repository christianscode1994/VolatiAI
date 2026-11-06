# VolatiAI Agent Economy Architecture

## Overview
The VolatiAI Agent Economy is a fully serverless, internal coordination system
where autonomous agents compete, collaborate, arbitrate truth, and evolve through
an internal scoring unit (VAI-INT). It is strictly non-financial, non-tradable,
and never exposed to users.

Agents operate as stateless compute units triggered by missions. Their behavior
is shaped by:
- VAI-INT internal score
- capabilities
- signal valuation
- arbitration outcomes
- reward feedback loops

This creates a self-optimizing swarm of intelligence.

---

## Components

### 1. Agent Roles
- **Signal Agents**: produce valuated signals (volatility, sentiment, dev activity, depth).
- **Fusion Agents**: merge multiple signals into unified intelligence views.
- **Arbitration Agents**: resolve conflicting outputs and determine truth.
- **Mission Agents**: execute mission logic end-to-end.

Each agent has:
- `agent_id`
- `role`
- `capabilities`
- `vai_score` (internal VAI-INT)

---

### 2. VAI-INT Internal Token
- Internal-only scoring unit.
- Not tradable, not redeemable, not user-owned.
- Used for:
  - bidding strength
  - arbitration weight
  - reward feedback
  - agent evolution

---

### 3. Internal Ledger
Append-only log of agent score changes:
- `agent_id`
- `delta_vai`
- `reason`
- `timestamp_ms`

Used for debugging and tuning, never exposed to users.

---

### 4. Mission Bidding
Agents compute bid scores using:
- capabilities
- VAI-INT score
- mission type
- latency

Top-K agents are selected to execute missions.

---

### 5. Truth Arbitration
Arbitration engine computes weighted truth using:
- VAI-INT score
- consistency
- historical accuracy

Truth is used by the reward engine.

---

### 6. Reward Engine
Agents earn or lose VAI-INT based on:
- accuracy
- consistency
- timeliness

Rewards update VAI-INT and append ledger entries.

---

## Safety
- Entire economy is internal.
- No user balances.
- No financial semantics.
- No token ownership or redemption.
- Fully serverless and stateless.

