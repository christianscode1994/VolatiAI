class VAIIntManager:
    def __init__(self, storage, ledger: VAIIntLedger):
        self.storage = storage
        self.ledger = ledger

    def apply_delta(self, agent_id: str, delta: int, reason: str, timestamp_ms: int) -> int:
        current = self.get_balance(agent_id)
        new_balance = current + delta

        # write balance
        self.storage.set_balance(agent_id, new_balance)

        # log ledger entry
        entry = LedgerEntry(
            agent_id=agent_id,
            delta=delta,
            reason=reason,
            timestamp_ms=timestamp_ms,
        )
        self.ledger.append(entry)

        return new_balance
