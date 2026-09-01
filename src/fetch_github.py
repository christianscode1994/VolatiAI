import requests

GITHUB_API = "https://api.github.com"

def github_repo_activity(owner: str, repo: str):
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    r = requests.get(url, timeout=10)
    if r.status_code != 200:
        return None
    data = r.json()

    return {
        "stars": data.get("stargazers_count"),
        "forks": data.get("forks_count"),
        "watchers": data.get("subscribers_count"),
        "open_issues": data.get("open_issues_count"),
        "last_push": data.get("pushed_at"),
        "created": data.get("created_at"),
    }

def github_trending_python():
    url = f"{GITHUB_API}/search/repositories?q=language:python&sort=stars&order=desc&per_page=10"
    r = requests.get(url, timeout=10)
    if r.status_code != 200:
        return []
    items = r.json().get("items", [])
    return [
        {
            "name": repo["full_name"],
            "stars": repo["stargazers_count"],
            "forks": repo["forks_count"],
            "updated": repo["updated_at"],
        }
        for repo in items
    ]
