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
