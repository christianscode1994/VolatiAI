from dataclasses import dataclass
from typing import List, Dict

@dataclass
class MissionSpec:
    mission_id: str
    mission_type: str          # e.g. "rank_volatility", "detect_anomaly"
    chains: List[str]          # ["SOL", "ETH", "TON"]
    deadline_ms: int           # max allowed latency
    params: Dict[str, str]     # extra config
