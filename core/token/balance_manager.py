class VAIIntManager:
    def __init__(self, storage):
        self.storage = storage  # abstraction over DB/KV

    def get_balance(self, agent_id: str) -> int:
        # returns current internal score
        ...

    def apply_delta(self, agent_id: str, delta: int, reason: str, timestamp_ms: int) -> int:
        """
        - Updates the agent's internal score.
        - Appends a ledger entry.
        - Returns new balance.
        """
        ...

    def set_balance(self, agent_id: str, new_balance: int, reason: str, timestamp_ms: int) -> int:
        """
        - Used only for initialization or corrective maintenance.
        - Not exposed to any external API.
        """
        ...
