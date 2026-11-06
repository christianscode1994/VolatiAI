# core/missions/mission_executor.py

from typing import Dict, List
from core.missions.mission_spec import MissionSpec
from core.missions.mission_bidding import MissionBiddingEngine
from core.missions.reward_engine import RewardEngine, RewardContext
from core.arbitration.arbitration_engine import ArbitrationEngine, ArbitrationContext
from core.agent.agent_base import Agent

class MissionExecutor:
    def __init__(
        self,
        bidding_engine: MissionBiddingEngine,
        reward_engine: RewardEngine,
        arbitration_engine: ArbitrationEngine,
    ):
        self.bidding_engine = bidding_engine
        self.reward_engine = reward_engine
        self.arbitration_engine = arbitration_engine

    def run_mission(self, mission: MissionSpec, all_agents: List[Agent], timestamp_ms: int):
        # 1. bidding
        top_agents = self.bidding_engine.select_top_k(mission, k=3)

        # 2. execution
        agent_outputs: Dict[str, dict] = {}
        for agent in top_agents:
            agent_outputs[agent.state.agent_id] = agent.execute(mission)

        # 3. arbitration
        arb_ctx = ArbitrationContext(
            mission_id=mission.mission_id,
            mission_type=mission.mission_type,
            agent_outputs=agent_outputs,
            timestamp_ms=timestamp_ms,
        )
        truth = self.arbitration_engine.arbitrate(arb_ctx)

        # 4. reward
        reward_ctx = RewardContext(
            mission_id=mission.mission_id,
            mission_type=mission.mission_type,
            agent_outputs=agent_outputs,
            truth=truth,
            timestamp_ms=timestamp_ms,
        )
        agents_map = {a.state.agent_id: a.state for a in top_agents}
        self.reward_engine.reward_agents(reward_ctx, agents_map)

        # 5. return final result
        return {
            "mission_id": mission.mission_id,
            "truth": truth,
            "agent_outputs": agent_outputs,
        }
