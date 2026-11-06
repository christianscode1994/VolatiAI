# src/scoring/dsi.py

from typing import Dict, Any


def dsi_score(dev_data: Dict[str, Any]) -> float:
    """
    Developer Sentiment Index

    Supports:
    1. Legacy repository schema
    2. New collector schema
    """

    # --------------------------------------
    # New collector schema
    # --------------------------------------

    if "commitCount" in dev_data:

        commits = float(
            dev_data.get(
                "commitCount",
                0
            )
        )

        score = min(
            commits * 5,
            100,
        )

        return round(
            score,
            2,
        )

    # --------------------------------------
    # Legacy schema
    # --------------------------------------

    repo = dev_data.get(
        "repo",
        {},
    )

    if not isinstance(repo, dict):
        return 0.0

    stars = repo.get(
        "stars",
        0,
    )

    forks = repo.get(
        "forks",
        0,
    )

    watchers = repo.get(
        "watchers",
        0,
    )

    issues = repo.get(
        "issues_last_30d",
        0,
    )

    last_push_days = repo.get(
        "last_push_days_ago",
        365,
    )

    trending = repo.get(
        "trending_velocity",
        0,
    )

    stars_score = min(
        stars / 1000 * 100,
        100,
    )

    forks_score = min(
        forks / 200 * 100,
        100,
    )

    watchers_score = min(
        watchers / 200 * 100,
        100,
    )

    issues_score = min(
        issues / 50 * 100,
        100,
    )

    recency_score = max(
        0,
        100
        - min(
            last_push_days,
            365,
        )
        / 365
        * 100,
    )

    trending_score = min(
        trending / 50 * 100,
        100,
    )

    return round(
        0.25 * stars_score +
        0.15 * forks_score +
        0.10 * watchers_score +
        0.15 * issues_score +
        0.20 * recency_score +
        0.15 * trending_score,
        2,
    )
