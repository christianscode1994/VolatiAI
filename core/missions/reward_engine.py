from dataclasses import dataclass
from typing import Dict

@dataclass
class RewardContext:
    mission_id: str
    mission_type: str
    agent_outputs: Dict[str, dict]   # agent_id -> output
    truth: dict                      # final arbitration truth
    timestamp_ms: int


# /core/missions/reward_engine.py

from core.token.balance_manager import VAIIntManager
from core.token.ledger import VAIIntLedger
from core.agent.agent_state import AgentState

class RewardEngine:
    def __init__(self, vai_manager: VAIIntManager, ledger: VAIIntLedger):
        self.vai_manager = vai_manager
        self.ledger = ledger

    def compute_reward(self, agent_state: AgentState, output: dict, truth: dict) -> int:
        """
        Compute delta VAI-INT for a single agent.
        """

        accuracy = self._compute_accuracy(output, truth)
        timeliness = output.get("timeliness", 1.0)
        consistency = output.get("consistency", 1.0)

        # Weighted reward formula
        delta = int(
            10 * accuracy +
            5 * consistency -
            2 * (1 - timeliness)
        )

        return delta

    def _compute_accuracy(self, output: dict, truth: dict) -> float:
        """
        Compare agent output to truth arbitration.
        """
        if "value" in output and "value" in truth:
            return 1.0 if output["value"] == truth["value"] else 0.0
        return 0.5  # fallback

    def reward_agents(self, reward_context: RewardContext, agents: Dict[str, AgentState]):
        """
        Apply rewards to all agents based on mission results.
        """

        for agent_id, output in reward_context.agent_outputs.items():
            agent_state = agents[agent_id]

            delta = self.compute_reward(agent_state, output, reward_context.truth)

            self.vai_manager.apply_delta(
                agent_id=agent_id,
                delta=delta,
                reason=f"reward:mission:{reward_context.mission_id}",
                timestamp_ms=reward_context.timestamp_ms
            )

            agent_state.vai_score += delta

