class Agent:
    def __init__(self, state: AgentState, vai_manager, ledger):
        self.state = state
        self.vai_manager = vai_manager
        self.ledger = ledger

    def bid(self, mission_spec) -> float:
        """
        Compute bid score based on:
        - vai_score
        - capabilities
        - mission type
        """
        raise NotImplementedError

    def execute(self, mission_spec):
        """
        Perform mission logic.
        """
        raise NotImplementedError

    def reward(self, delta: int, reason: str, timestamp_ms: int):
        """
        Apply VAI-INT reward or penalty.
        """
        new_balance = self.vai_manager.apply_delta(
            self.state.agent_id,
            delta,
            reason,
            timestamp_ms
        )
        self.state.vai_score = new_balance
