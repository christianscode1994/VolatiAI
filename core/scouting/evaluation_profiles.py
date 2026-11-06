# /core/scouting/evaluation_profiles.py

from dataclasses import dataclass

@dataclass
class EvaluationProfile:
    name: str
    weights: dict  # e.g. {"volatility": 0.3, "sentiment": 0.2, "dev": 0.3, "depth": 0.2}

DEFAULT_PROFILE = EvaluationProfile(
    name="default",
    weights={
        "volatility": 0.3,
        "sentiment": 0.2,
        "dev_velocity": 0.3,
        "depth_stress": 0.2,
    },
)
