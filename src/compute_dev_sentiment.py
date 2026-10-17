"""Aggregate dev activity across tracked DeFi protocols."""

import logging
from typing import Optional

from src.config_signals import DEV_TRACKED
from src.fetch_github import repo_info, repo_commits_since, repo_releases_since

logger = logging.getLogger("volatai.dev")


def compute_dev_sentiment(days: int = 7) -> dict:
    """
    Returns:
      {
        "protocols_tracked": N,
        "protocols_active": N,     # with >=1 commit
        "protocols_dormant": N,    # 0 commits
        "commits_total": N,
        "commits_avg": float,
        "active_developers": N,
        "releases_total": N,
        "top_active": [{protocol, repo, commits}, ...],
        "dormant": [protocol, ...],
        "signal": "high" | "normal" | "low" | "dormant"
      }
    """
    per_protocol = []
    all_authors = set()

    for name, full_repo in DEV_TRACKED:
        owner, repo = full_repo.split("/", 1)
        try:
            info = repo_info(owner, repo)
            if not info:
                logger.debug("dev: %s unreachable", name)
                per_protocol.append({"protocol": name, "repo": full_repo, "commits": 0, "error": "unreachable"})
                continue

            commits_data = repo_commits_since(owner, repo, days=days)
            releases = repo_releases_since(owner, repo, days=days)

            per_protocol.append({
                "protocol": name,
                "repo": full_repo,
                "commits": commits_data["commits"],
                "releases": releases,
                "stars": info.get("stars", 0),
            })
            all_authors.update(commits_data["authors"])
        except Exception as e:
            logger.warning("dev: %s failed: %s", name, e)
            per_protocol.append({"protocol": name, "repo": full_repo, "commits": 0, "error": str(e)[:60]})

    total_commits = sum(p["commits"] for p in per_protocol)
    active = [p for p in per_protocol if p["commits"] > 0]
    dormant = [p["protocol"] for p in per_protocol if p["commits"] == 0]
    avg_commits = round(total_commits / len(per_protocol), 2) if per_protocol else 0.0

    signal = "dormant"
    if avg_commits > 20:
        signal = "high"
    elif avg_commits > 5:
        signal = "normal"
    elif avg_commits > 0:
        signal = "low"

    top = sorted(active, key=lambda p: p["commits"], reverse=True)[:5]

    return {
        "protocols_tracked": len(per_protocol),
        "protocols_active": len(active),
        "protocols_dormant": len(dormant),
        "commits_total": total_commits,
        "commits_avg": avg_commits,
        "active_developers": len(all_authors),
        "releases_total": sum(p.get("releases", 0) for p in per_protocol),
        "top_active": top,
        "dormant": dormant,
        "signal": signal,
        "window_days": days,
    }
