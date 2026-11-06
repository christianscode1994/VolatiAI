# modules/agents/narrative_agent.py

from modules.agents.base_agent import BaseAgent

class NarrativeAgent(BaseAgent):
    def run(self) -> dict:
        narratives = self.uio.get("narratives", {})

        tw = narratives.get("twitter", {}).get("momentum", 0)
        tg = narratives.get("telegram", {}).get("momentum", 0)
        dc = narratives.get("discord", {}).get("momentum", 0)

        momentum = (tw + tg + dc) / 3

        return {
            "narrative_momentum": round(momentum, 3),
            "sources": {
                "twitter": tw,
                "telegram": tg,
                "discord": dc,
            }
        }
