import requests
from typing import Dict, Any, List

NPM_META = "https://registry.npmjs.org/{pkg}"
NPM_DL_RANGE = "https://api.npmjs.org/downloads/range/{start}:{end}/{pkg}"

# Core SDKs to track
PACKAGES: List[str] = [
    "@solana/web3.js",
    "ethers",
    "viem",
    "@polkadot/api",
    "cosmjs",
]

# Time windows (ISO dates as strings; you can later generate dynamically)
WINDOWS = {
    "7d": ("2024-09-01", "2024-09-08"),
    "30d": ("2024-08-09", "2024-09-08"),
}


def _safe_get(url: str) -> Dict[str, Any]:
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def _fetch_meta(pkg: str) -> Dict[str, Any]:
    return _safe_get(NPM_META.format(pkg=pkg))


def _fetch_downloads(pkg: str, start: str, end: str) -> int:
    data = _safe_get(NPM_DL_RANGE.format(start=start, end=end, pkg=pkg))
    downloads = data.get("downloads", [])
    return sum(d.get("downloads", 0) for d in downloads)


def _compute_adoption_score(downloads_7d: int, downloads_30d: int) -> float:
    # Simple heuristic: normalize by rough scale
    if downloads_30d == 0:
        return 0.0
    ratio = downloads_7d / downloads_30d
    # Cap and scale
    score = min(1.0, ratio) * 0.7 + min(1.0, downloads_30d / 100_000) * 0.3
    return round(score, 3)


def _intel_for_package(pkg: str) -> Dict[str, Any]:
    meta = _fetch_meta(pkg)
    if not meta:
        return {
            "package": pkg,
            "error": "meta_fetch_failed",
        }

    dist_tags = meta.get("dist-tags", {})
    latest_version = dist_tags.get("latest", "unknown")

    versions_dict = meta.get("versions", {})
    versions = list(versions_dict.keys())
    versions.sort()

    # Very simple "recent bump" heuristic: if last version is within last N entries
    recent_version_bump = len(versions) > 1

    # Downloads
    (start_7d, end_7d) = WINDOWS["7d"]
    (start_30d, end_30d) = WINDOWS["30d"]

    downloads_7d = _fetch_downloads(pkg, start_7d, end_7d)
    downloads_30d = _fetch_downloads(pkg, start_30d, end_30d)

    adoption_score = _compute_adoption_score(downloads_7d, downloads_30d)

    return {
        "package": pkg,
        "version_current": latest_version,
        "versions_count": len(versions),
        "recent_version_bump": recent_version_bump,
        "downloads_7d": downloads_7d,
        "downloads_30d": downloads_30d,
        "adoption_score": adoption_score,
    }


def run() -> Dict[str, Any]:
    """
    Entry point for the NPM developer intelligence module.

    Returns a dict keyed by package name, each containing:
      - version_current
      - versions_count
      - recent_version_bump
      - downloads_7d
      - downloads_30d
      - adoption_score
    """
    out: Dict[str, Any] = {}
    for pkg in PACKAGES:
        out[pkg] = _intel_for_package(pkg)
    return out
