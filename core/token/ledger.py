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
