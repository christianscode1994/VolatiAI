# Mission Bidding Architecture

## Purpose
Explain why agents bid for missions and how VAI-INT influences competition.

## MissionSpec
Document fields: mission_id, mission_type, chains, deadline_ms, params.

## Bidding Formula
Show how capability_fit, vai_score, latency, and mission type combine.

## Bidding Engine
Explain collect_bids() and select_top_k().

## Flow
1. Mission created
2. Agents loaded
3. Bidding
4. Execution
5. Rewarding

## Safety
- No user bidding
- No financial stakes
- Purely internal agent coordination
