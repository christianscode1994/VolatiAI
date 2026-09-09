import requests
from typing import Dict, Any, List

CRATE_META = "https://crates.io/api/v1/crates/{crate}"

# Core Rust ecosystem crates to track
CRATES: List[str] = [
    "solana-program",   # Solana on-chain programs
    "polkadot",         # Polkadot core
    "substrate",        # Substrate framework
    "cosmos-sdk",       # Cosmos SDK (if present)
]


def _safe_get(url: str) -> Dict[str, Any]:
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def _intel_for_crate(crate: str) -> Dict[str, Any]:
    data = _safe_get(CRATE_META.format(crate=crate))
    if not data or "crate" not in data:
        return {
            "crate": crate,
            "error": "meta_fetch_failed",
        }

    crate_info = data["crate"]
    versions = data.get("versions", [])

    latest_version = crate_info.get("max_version", "unknown")
    total_downloads = crate_info.get("downloads", 0)

    # Very simple "recent activity" heuristic:
    # count versions created in the last N entries
    recent_versions_count = len(versions[-5:]) if versions else 0

    # Adoption score: normalize downloads + recent versions
    adoption_score = 0.0
    adoption_score += min(0.7, total_downloads / 500_000)  # downloads
    adoption_score += min(0.3, recent_versions_count * 0.05)  # recent updates

    return {
        "crate": crate,
        "version_current": latest_version,
        "versions_count": len(versions),
        "recent_versions_count": recent_versions_count,
        "downloads": total_downloads,
        "adoption_score": round(adoption_score, 3),
    }


def run() -> Dict[str, Any]:
    """
    Entry point for the Cargo developer intelligence module.

    Returns a dict keyed by crate name, each containing:
      - version_current
      - versions_count
      - recent_versions_count
      - downloads
      - adoption_score
    """
    out: Dict[str, Any] = {}
    for crate in CRATES:
        out[crate] = _intel_for_crate(crate)
    return out
