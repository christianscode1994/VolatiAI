# modules/agents/trend_agent.py

from modules.agents.base_agent import BaseAgent

class TrendAgent(BaseAgent):
    def run(self) -> dict:
        market = self.uio.get("market", {})
        vol = market.get("volatility", {})
        depth = market.get("depth", {})

        vol_score = vol.get("score", 0)
        depth_score = depth.get("score", 0)

        # Simple logic (you will refine later)
        if vol_score > 0.6 and depth_score > 0.5:
            trend = "bullish"
            confidence = 0.8
        elif vol_score < 0.3 and depth_score < 0.4:
            trend = "bearish"
            confidence = 0.75
        else:
            trend = "neutral"
            confidence = 0.5

        return {
            "trend": trend,
            "confidence": confidence,
        }
