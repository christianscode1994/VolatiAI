from datetime import datetime, timezone

def normalize(value, max_value):
    if value is None:
        return 0
    return min(100, int((value / max_value) * 100))

def recency_score(timestamp):
    if not timestamp:
        return 0
    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    diff_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    if diff_hours < 1:
        return 100
    if diff_hours < 24:
        return 80
    if diff_hours < 72:
        return 60
    if diff_hours < 168:
        return 40
    return 20

def compute_dev_sentiment(github_data):
    if not github_data:
        return 0

    repo = github_data.get("volatiai_repo", {})
    trending = github_data.get("trending_python", [])

    stars = normalize(repo.get("stars"), 5000)
    forks = normalize(repo.get("forks"), 2000)
    watchers = normalize(repo.get("watchers"), 1000)
    issues = normalize(repo.get("open_issues"), 500)
    recency = recency_score(repo.get("last_push"))

    trending_score = normalize(len(trending), 50)

    # Weighted score
    score = (
        stars * 0.25 +
        forks * 0.20 +
        watchers * 0.15 +
        recency * 0.20 +
        trending_score * 0.20
    )

    return int(score)
