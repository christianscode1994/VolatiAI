from dataclasses import dataclass

@dataclass
class ValuatedSignal:
    chain: str
    signal_type: str
    value: float
    confidence: float
    volatility_score: float
    sentiment_score: float
    dev_velocity_score: float
    depth_stress_score: float

def normalize(x: float, min_x: float, max_x: float) -> float:
    if max_x == min_x:
        return 0.5
    return (x - min_x) / (max_x - min_x)

def clamp(x: float, low=0.0, high=1.0) -> float:
    return max(low, min(high, x))


class SignalValuationEngine:
    def __init__(self):
        pass

    def valuate(self, raw_signal: dict) -> ValuatedSignal:
        chain = raw_signal["chain"]
        signal_type = raw_signal["type"]
        value = raw_signal["value"]

        volatility_score = clamp(normalize(
            raw_signal.get("volatility", 0.0),
            0.0, 100.0
        ))

        sentiment_score = clamp((raw_signal.get("sentiment", 0.0) + 1) / 2)

        dev_velocity_score = clamp(normalize(
            raw_signal.get("dev_activity", 0.0),
            0.0, 500.0
        ))

        depth_stress_score = clamp(normalize(
            raw_signal.get("depth_stress", 0.0),
            0.0, 1.0
        ))

        confidence = self.compute_confidence(
            volatility_score,
            sentiment_score,
            dev_velocity_score,
            depth_stress_score
        )

        return ValuatedSignal(
            chain=chain,
            signal_type=signal_type,
            value=value,
            confidence=confidence,
            volatility_score=volatility_score,
            sentiment_score=sentiment_score,
            dev_velocity_score=dev_velocity_score,
            depth_stress_score=depth_stress_score
        )


    def compute_confidence(
        self,
        volatility_score,
        sentiment_score,
        dev_velocity_score,
        depth_stress_score
    ) -> float:

        return clamp(
            0.35 * volatility_score +
            0.25 * sentiment_score +
            0.25 * dev_velocity_score +
            0.15 * (1 - depth_stress_score)
        )


















