# modules/agents/risk_agent.py

from modules.agents.base_agent import BaseAgent

class RiskAgent(BaseAgent):
    def run(self) -> dict:
        risk = self.uio.get("risk", {})

        liq = risk.get("liquidations", {}).get("total", 0)
        funding = risk.get("funding", {}).get("value", 0)
        oi = risk.get("open_interest", {}).get("value", 0)

        score = 0.0

        # Liquidation pressure
        score += min(0.4, liq / 1_000_000)

        # Funding rate stress
        score += min(0.3, abs(funding) * 5)

        # Open interest overheating
        score += min(0.3, oi / 10_000_000)

        return {
            "risk_level": round(score, 3),
            "liquidation_pressure": liq,
            "funding_rate": funding,
            "open_interest": oi,
        }
