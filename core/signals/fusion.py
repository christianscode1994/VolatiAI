# core/signals/fusion.py

from dataclasses import dataclass
from typing import List
from core.signals.valuation import ValuatedSignal

@dataclass:
class FusedView:
    chains: List[str]
    view_type: str          # e.g. "market_overview", "chain_health"
    value: float
    confidence: float

class FusionEngine:
    def __init__(self):
        pass

    def fuse(self, signals: List[ValuatedSignal], view_type: str) -> FusedView:
        if not signals:
            return FusedView(chains=[], view_type=view_type, value=0.0, confidence=0.0)

        chains = list({s.chain for s in signals})

        # weighted average by confidence
        total_weight = sum(s.confidence for s in signals)
        if total_weight == 0:
            return FusedView(chains=chains, view_type=view_type, value=0.0, confidence=0.0)

        fused_value = sum(s.value * s.confidence for s in signals) / total_weight
        fused_confidence = total_weight / len(signals)

        return FusedView(
            chains=chains,
            view_type=view_type,
            value=fused_value,
            confidence=fused_confidence
        )
