from typing import List, Tuple
from .mission_spec import MissionSpec
from core.agent.agent_base import Agent

class MissionBiddingEngine:
    def __init__(self, agents: List[Agent]):
        self.agents = agents

    def collect_bids(self, mission: MissionSpec) -> List[Tuple[Agent, float]]:
        bids = []
        for agent in self.agents:
            score = agent.bid(mission)
            bids.append((agent, score))
        return bids

    def select_top_k(self, mission: MissionSpec, k: int = 3) -> List[Agent]:
        bids = self.collect_bids(mission)
        # sort by bid score descending
        bids.sort(key=lambda x: x[1], reverse=True)
        return [agent for agent, score in bids[:k]]
