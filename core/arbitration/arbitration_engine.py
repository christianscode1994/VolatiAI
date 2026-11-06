# core/arbitration/arbitration_engine.py

from dataclasses import dataclass
from typing import Dict

@dataclass
class ArbitrationContext:
    mission_id: str
    mission_type: str
    agent_outputs: Dict[str, dict]   # agent_id -> output
    timestamp_ms: int


from core.agent.agent_state import AgentState

class ArbitrationEngine:
    def __init__(self, agent_states: Dict[str, AgentState]):
        self.agent_states = agent_states

    def compute_vote_weight(self, agent_state: AgentState, output: dict) -> float:
        vai_term = agent_state.vai_score / 1000.0
        consistency = output.get("consistency", 0.5)
        historical_accuracy = agent_state.capabilities.get("historical_accuracy", 0.5)

        return (
            1.0 * vai_term +
            0.7 * consistency +
            0.8 * historical_accuracy
        )

    def arbitrate(self, ctx: ArbitrationContext) -> dict:
        """
        Returns final truth dict.
        """

        # aggregate votes per value
        value_votes: Dict[str, float] = {}

        for agent_id, output in ctx.agent_outputs.items():
            agent_state = self.agent_states[agent_id]
            weight = self.compute_vote_weight(agent_state, output)

            value = output.get("value")
            if value is None:
                continue

            value_votes[value] = value_votes.get(value, 0.0) + weight

        # pick value with max total weight
        if not value_votes:
            return {"value": None, "confidence": 0.0}

        best_value = max(value_votes.items(), key=lambda x: x[1])[0]
        total_weight = sum(value_votes.values())
        best_weight = value_votes[best_value]

        return {
            "value": best_value,
            "confidence": best_weight / total_weight if total_weight > 0 else 0.0
        }



















