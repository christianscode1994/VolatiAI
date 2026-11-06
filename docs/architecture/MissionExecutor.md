# Mission Executor Architecture

## Purpose
The Mission Executor runs full missions end-to-end:
1. Mission bidding
2. Agent selection
3. Mission execution
4. Truth arbitration
5. Reward distribution

It is the orchestration layer of the VolatiAI agentic system.

## Inputs
- MissionSpec
- List of Agent objects
- timestamp_ms

MissionSpec includes:
- mission_id
- mission_type
- chains
- deadline_ms
- params

## Flow

### 1. Bidding
MissionBiddingEngine.select_top_k(mission, k)
- Agents compute bid scores using:
  - capabilities
  - VAI-INT score
  - mission type
  - latency

### 2. Execution
Top-K agents run execute(mission_spec)
- Produces agent_outputs: agent_id -> output dict

### 3. Arbitration
ArbitrationEngine.arbitrate()
- Computes weighted truth using:
  - VAI-INT score
  - consistency
  - historical accuracy

### 4. Rewarding
RewardEngine.reward_agents()
- Computes delta VAI-INT for each agent
- Updates balances
- Logs ledger entries

### 5. Final Output
{
  "mission_id": ...,
  "truth": ...,
  "agent_outputs": ...
}

## Serverless Compatibility
- Stateless orchestration
- Externalized state (DB/KV)
- Short-lived execution
- No long-running processes

## Safety
- Internal only
- Non-financial
- No user bidding
- No token ownership or redemption
