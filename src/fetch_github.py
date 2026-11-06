"""GitHub API client for DeFi protocol dev activity."""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("volatai.github")

GITHUB_API = "https://api.github.com"


def _headers() -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VolatiAI/1.0",
    }
    token = os.getenv("GITHUB_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _get(path: str, params: Optional[dict] = None, timeout: int = 15):
    try:
        r = requests.get(
            f"{GITHUB_API}{path}",
            headers=_headers(),
            params=params or {},
            timeout=timeout,
        )
        if r.status_code == 404:
            return None
        if r.status_code == 403:
            logger.warning("GitHub 403 (rate limit?) for %s", path)
            return None
        if r.status_code != 200:
            logger.warning("GitHub %s for %s", r.status_code, path)
            return None
        return r.json()
    except Exception as e:
        logger.warning("GitHub request failed: %s", e)
        return None


def repo_info(owner: str, repo: str) -> Optional[dict]:
    data = _get(f"/repos/{owner}/{repo}")
    if not data:
        return None
    return {
        "full_name": data.get("full_name"),
        "stars": data.get("stargazers_count", 0),
        "forks": data.get("forks_count", 0),
        "open_issues": data.get("open_issues_count", 0),
        "last_push": data.get("pushed_at"),
    }


def repo_commits_since(owner: str, repo: str, days: int = 7) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    commits = _get(
        f"/repos/{owner}/{repo}/commits",
        params={"since": since, "per_page": 100},
    )
    if not commits or not isinstance(commits, list):
        return {"commits": 0, "authors": set()}

    authors = set()
    for c in commits:
        # prefer login (may be null for unlinked commits), fallback to name
        author = c.get("author") or {}
        login = author.get("login")
        if login:
            authors.add(login)
        else:
            name = (c.get("commit", {}).get("author") or {}).get("name")
            if name:
                authors.add(name)

    return {"commits": len(commits), "authors": authors}


def repo_releases_since(owner: str, repo: str, days: int = 7) -> int:
    releases = _get(
        f"/repos/{owner}/{repo}/releases",
        params={"per_page": 10},
    )
    if not releases or not isinstance(releases, list):
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    count = 0
    for rel in releases:
        pub = rel.get("published_at")
        if not pub:
            continue
        try:
            dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            if dt >= cutoff:
                count += 1
        except Exception:
            continue
    return count
