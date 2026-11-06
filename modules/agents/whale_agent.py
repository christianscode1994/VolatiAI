# modules/agents/whale_agent.py

from modules.agents.base_agent import BaseAgent

class WhaleAgent(BaseAgent):
    def run(self) -> dict:
        market = self.uio.get("market", {})
        dex = market.get("dex", {})

        whale_buys = dex.get("whale_buys_24h", 0)
        whale_sells = dex.get("whale_sells_24h", 0)

        total = whale_buys + whale_sells
        if total == 0:
            dominance = 0.0
        else:
            dominance = whale_buys / total

        return {
            "whale_dominance": round(dominance, 3),
            "whale_buys_24h": whale_buys,
            "whale_sells_24h": whale_sells,
        }
