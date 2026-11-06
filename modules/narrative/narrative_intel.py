import random
import time


def _norm(x, low, high):
    """Normalize x into [0,1] range."""
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def _mock_sentiment():
    """Mock sentiment score (-1 to 1)."""
    return round(random.uniform(-1.0, 1.0), 3)


def _mock_volume_social():
    """Mock social volume."""
    return random.randint(1000, 500000)


def _mock_acceleration():
    """Mock narrative acceleration (0–1)."""
    return round(random.uniform(0.0, 1.0), 3)


def _mock_topic_spread():
    """Mock topic spread (0–1)."""
    return round(random.uniform(0.0, 1.0), 3)


def compute_narrative_intel():
    """
    Narrative intelligence engine v1.
    Replace mocks with real API calls later.
    """

    sentiment = _mock_sentiment()
    social_volume = _mock_volume_social()
    acceleration = _mock_acceleration()
    spread = _mock_topic_spread()

    sentiment_score = (sentiment + 1) / 2  # map -1..1 → 0..1
    volume_score = _norm(social_volume, 1000, 500000)
    accel_score = acceleration
    spread_score = 1 - spread  # lower spread = more focused narrative

    narrative_score = (
        0.30 * sentiment_score +
        0.30 * volume_score +
        0.20 * accel_score +
        0.20 * spread_score
    )

    return {
        "timestamp": int(time.time()),
        "sentiment": sentiment,
        "social_volume": social_volume,
        "acceleration": acceleration,
        "topic_spread": spread,
        "scores": {
            "sentiment_score": round(sentiment_score, 3),
            "volume_score": round(volume_score, 3),
            "acceleration_score": round(accel_score, 3),
            "spread_score": round(spread_score, 3),
            "narrative_score": round(narrative_score, 3),
        }
    }
