# modules/agents/spoof_agent.py

from modules.agents.base_agent import BaseAgent

class SpoofAgent(BaseAgent):
    def run(self) -> dict:
        depth = self.uio.get("market", {}).get("depth", {})

        bid_wall = depth.get("bid_wall", 0)
        ask_wall = depth.get("ask_wall", 0)

        imbalance = abs(bid_wall - ask_wall)

        # Simple heuristic
        spoof_prob = min(1.0, imbalance / 100000)

        return {
            "spoofing_probability": round(spoof_prob, 3),
            "depth_imbalance": imbalance,
        }
