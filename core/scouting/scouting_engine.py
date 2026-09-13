# /core/scouting/scouting_engine.py

from typing import List, Dict
from core.signals.valuation import ValuatedSignal
from core.signals.fusion import FusedView
from .evaluation_profiles import EvaluationProfile

class ScoutingEngine:
    def __init__(self, profile: EvaluationProfile):
        self.profile = profile

    def evaluate_chain(self, signals: List[ValuatedSignal]) -> float:
        if not signals:
            return 0.0

        # simple aggregate per dimension
        avg_vol = sum(s.volatility_score for s in signals) / len(signals)
        avg_sent = sum(s.sentiment_score for s in signals) / len(signals)
        avg_dev = sum(s.dev_velocity_score for s in signals) / len(signals)
        avg_depth = sum(s.depth_stress_score for s in signals) / len(signals)

        w = self.profile.weights

        score = (
            w["volatility"] * avg_vol +
            w["sentiment"] * avg_sent +
            w["dev_velocity"] * avg_dev +
            w["depth_stress"] * (1 - avg_depth)
        )

        return score

    def rank_targets(
        self,
        spec,
        signals_by_chain: Dict[str, List[ValuatedSignal]],
    ) -> List[tuple]:
        """
        Returns [(chain, score)] sorted descending.
        """
        scores = []
        for chain in spec.targets:
            chain_signals = signals_by_chain.get(chain, [])
            score = self.evaluate_chain(chain_signals)
            scores.append((chain, score))

        return sorted(scores, key=lambda x: x[1], reverse=True)
