# modules/agents/spoof_agent.py

from modules.agents.base_agent import BaseAgent


class SpoofAgent(BaseAgent):

    LARGE_WALL_USD = 500_000

    def _safe_float(self, value):

        try:
            return float(value)
        except Exception:
            return 0.0

    def run(self) -> dict:

        depth = (
            self.uio
            .get("market", {})
            .get("depth", {})
        )

        asks = (
            depth.get("asks")
            or depth.get("a")
            or []
        )

        bids = (
            depth.get("bids")
            or depth.get("b")
            or []
        )

        ask_notional = 0.0
        bid_notional = 0.0

        ask_walls = 0
        bid_walls = 0

        for level in asks:

            try:

                price = float(level[0])
                size = float(level[1])

                notional = price * size

                ask_notional += notional

                if notional >= self.LARGE_WALL_USD:
                    ask_walls += 1

            except Exception:
                continue

        for level in bids:

            try:

                price = float(level[0])
                size = float(level[1])

                notional = price * size

                bid_notional += notional

                if notional >= self.LARGE_WALL_USD:
                    bid_walls += 1

            except Exception:
                continue

        total = ask_notional + bid_notional

        if total <= 0:

            imbalance = 0.0

        else:

            imbalance = (
                bid_notional -
                ask_notional
            ) / total

        directional_bias = (

            "bullish"

            if imbalance > 0.10

            else "bearish"

            if imbalance < -0.10

            else "neutral"
        )

        wall_imbalance = abs(
            bid_walls - ask_walls
        )

        spoof_probability = min(
            1.0,
            (
                abs(imbalance) * 0.7 +
                min(wall_imbalance / 10, 1.0) * 0.3
            )
        )

        return {

            "schema_version": "2.0",

            "spoofing_probability":
                round(
                    spoof_probability,
                    3
                ),

            "depth_imbalance":
                round(
                    imbalance,
                    4
                ),

            "directional_bias":
                directional_bias,

            "bid_notional":
                round(
                    bid_notional,
                    2
                ),

            "ask_notional":
                round(
                    ask_notional,
                    2
                ),

            "bid_walls":
                bid_walls,

            "ask_walls":
                ask_walls,

            "wall_imbalance":
                wall_imbalance
        }
