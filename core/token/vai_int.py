from dataclasses import dataclass
from typing import Literal

@dataclass
class VAIIntBalance:
    agent_id: str
    balance: int  # i64 / int64 equivalent

@dataclass
class VAIIntDelta:
    agent_id: str
    delta: int
    reason: str  # "reward:mission", "bid:mission", "penalty:arbitration"
    timestamp_ms: int
