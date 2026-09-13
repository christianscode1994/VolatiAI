class SignalAgent(Agent):
    def bid(self, mission_spec):
        # Example: confidence * accuracy * (1 + vai_score/1000)
        return (
            self.state.capabilities.get("confidence", 0.5)
            * self.state.capabilities.get("accuracy", 0.5)
            * (1 + self.state.vai_score / 1000)
        )

    def execute(self, mission_spec):
        # Produce raw signal packet
        return {"signal": "value", "confidence": self.state.capabilities.get("confidence", 0.5)}

class FusionAgent(Agent):
    def bid(self, mission_spec):
        return (
            self.state.capabilities.get("fusion_strength", 0.5)
            * (1 + self.state.vai_score / 1500)
        )

    def execute(self, mission_spec):
        # Combine signals
        return {"fusion_view": "combined"}


class ArbitrationAgent(Agent):
    def bid(self, mission_spec):
        return (
            self.state.capabilities.get("consistency", 0.5)
            * (1 + self.state.vai_score / 2000)
        )

    def execute(self, mission_spec):
        # Vote on truth
        return {"vote": self.state.capabilities.get("consistency", 0.5)}


class MissionAgent(Agent):
    def bid(self, mission_spec):
        return (
            self.state.capabilities.get("mission_fit", 0.5)
            * (1 + self.state.vai_score / 1200)
        )

    def execute(self, mission_spec):
        # Run mission logic
        return {"result": "mission_output"}



class SignalAgent(Agent):
    def bid(self, mission_spec):
        capability_fit = self.state.capabilities.get("signal_fit", 0.5)
        latency = self.state.capabilities.get("latency", 0.5)
        vai_term = 1 + self.state.vai_score / 1000

        return capability_fit * vai_term - 0.1 * latency









