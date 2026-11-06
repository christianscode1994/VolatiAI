@dataclass
class LedgerEntry:
    agent_id: str
    delta: int
    reason: str
    timestamp_ms: int

class VAIIntLedger:
    def append(self, entry: LedgerEntry) -> None:
        ...

    def list_for_agent(self, agent_id: str, limit: int = 100) -> list[LedgerEntry]:
        ...

class VAIIntLedger:
    def __init__(self, storage):
        self.storage = storage  # abstraction over DB/KV

    def append(self, entry: LedgerEntry) -> None:
        """
        - Writes a single ledger entry.
        - No return value needed.
        """
        ...

    def list_for_agent(self, agent_id: str, limit: int = 100) -> list[LedgerEntry]:
        """
        - Returns recent entries for an agent.
        - Used for debugging and analysis only.
        """
        ...

    def list_recent(self, limit: int = 1000) -> list[LedgerEntry]:
        """
        - Returns recent global entries.
        - For monitoring and tuning.
        """
        ...
