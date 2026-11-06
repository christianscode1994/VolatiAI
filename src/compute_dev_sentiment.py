"""Aggregate dev activity across tracked crypto protocols, per category."""

import logging
from collections import defaultdict

from src.config_signals import DEV_TRACKED
from src.fetch_github import repo_info, repo_commits_since, repo_releases_since

logger = logging.getLogger("volatai.dev")


def _signal_for_avg(avg_commits: float) -> str:
    if avg_commits > 25:
        return "very_high"
    if avg_commits > 8:
        return "high"
    if avg_commits > 2:
        return "normal"
    if avg_commits > 0:
        return "low"
    return "dormant"


def compute_dev_sentiment(days: int = 7) -> dict:
    per_protocol = []
    all_authors = set()

    for entry in DEV_TRACKED:
        # Support both 2- and 3-tuple entries
        if len(entry) == 3:
            name, full_repo, category = entry
        else:
            name, full_repo = entry
            category = "uncategorized"

        owner, repo = full_repo.split("/", 1)
        try:
            info = repo_info(owner, repo)
            if not info:
                per_protocol.append({
                    "protocol": name, "repo": full_repo, "category": category,
                    "commits": 0, "error": "unreachable",
                })
                continue

            commits_data = repo_commits_since(owner, repo, days=days)
            releases = repo_releases_since(owner, repo, days=days)

            per_protocol.append({
                "protocol": name,
                "repo": full_repo,
                "category": category,
                "commits": commits_data["commits"],
                "releases": releases,
                "stars": info.get("stars", 0),
            })
            all_authors.update(commits_data["authors"])
        except Exception as e:
            logger.warning("dev: %s failed: %s", name, e)
            per_protocol.append({
                "protocol": name, "repo": full_repo, "category": category,
                "commits": 0, "error": str(e)[:60],
            })

    total_commits = sum(p["commits"] for p in per_protocol)
    active = [p for p in per_protocol if p["commits"] > 0]
    dormant = [p["protocol"] for p in per_protocol if p["commits"] == 0]
    avg_commits = round(total_commits / len(per_protocol), 2) if per_protocol else 0.0

    # Aggregate by category
    categories = defaultdict(lambda: {"tracked": 0, "active": 0, "commits": 0})
    for p in per_protocol:
        cat = p["category"]
        categories[cat]["tracked"] += 1
        categories[cat]["commits"] += p["commits"]
        if p["commits"] > 0:
            categories[cat]["active"] += 1

    by_category = {}
    for cat, data in categories.items():
        avg = data["commits"] / data["tracked"] if data["tracked"] else 0.0
        by_category[cat] = {
            "tracked": data["tracked"],
            "active": data["active"],
            "commits": data["commits"],
            "avg": round(avg, 2),
            "signal": _signal_for_avg(avg),
        }

    hot_layer = max(by_category.items(), key=lambda x: x[1]["commits"])[0] if by_category else None

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
        "by_category": by_category,
        "hot_layer": hot_layer,
        "signal": _signal_for_avg(avg_commits),
        "window_days": days,
    }
