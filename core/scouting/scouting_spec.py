# /core/scouting/scouting_spec.py
from dataclasses import dataclass
from typing import List, Dict

@dataclass
class ScoutingSpec:
    scouting_id: str
    focus_type: str        # e.g. "chain", "ecosystem", "narrative"
    targets: List[str]     # ["SOL", "TON", "ETH"] or narrative IDs
    params: Dict[str, str] # e.g. {"horizon": "7d", "risk": "medium"}


