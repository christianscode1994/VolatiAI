from datetime import datetime, timezone

def detect_spike(current, previous, threshold=1.5):
    if previous == 0:
        return current > 0
    return current / previous >= threshold

def detect_narratives(github_data, history):
    """
    github_data: current GitHub snapshot
    history: list of previous snapshots (from private/pro.json history)
    """

    if not github_data or not history:
        return []

    repo = github_data.get("volatiai_repo", {})
    prev = history[-1].get("github", {}).get("volatiai_repo", {})

    narratives = []

    # Spike in stars
    if detect_spike(repo.get("stars", 0), prev.get("stars", 0)):
        narratives.append("Star spike detected — early developer interest forming.")

    # Spike in forks
    if detect_spike(repo.get("forks", 0), prev.get("forks", 0)):
        narratives.append("Fork spike detected — developers experimenting with the code.")

    # Spike in watchers
    if detect_spike(repo.get("watchers", 0), prev.get("watchers", 0)):
        narratives.append("Watcher spike detected — ecosystem attention rising.")

    # Recent push activity
    last_push = repo.get("last_push")
    if last_push:
        dt = datetime.fromisoformat(last_push.replace("Z", "+00:00"))
        hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        if hours < 1:
            narratives.append("Fresh commit detected — active development underway.")
        elif hours < 24:
            narratives.append("Recent development activity — project momentum increasing.")

    # Trending repos
    trending = github_data.get("trending_python", [])
    if len(trending) > 0:
        narratives.append("Python ecosystem trending — possible new AI/agent frameworks emerging.")

    return narratives
