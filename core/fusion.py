# core/fusion.py

from modules.developer import (
    npm_intel,
    cargo_intel,
    solana_intel,
    polkadot_intel,
    cosmos_intel,
    solidity_intel,
)

def _safe(val, default=0.0):
    return val if isinstance(val, (int, float)) else default


def compute_dev_score() -> float:
    """
    Combine all developer APIs into a single ecosystem score.
    Uses:
      - NPM adoption_score
      - Cargo downloads
      - Solana validator_health
      - Polkadot spec_version / runtime_upgrades
      - Cosmos governance_activity
      - Solidity latest_block / (later: deployments)
    """

    # NPM
    npm_data = npm_intel.run()
    npm_scores = []
    for pkg, info in npm_data.items():
        npm_scores.append(_safe(info.get("adoption_score"), 0.0))
    npm_score = sum(npm_scores) / len(npm_scores) if npm_scores else 0.0

    # Cargo
    cargo_data = cargo_intel.run()
    cargo_downloads = []
    for crate, info in cargo_data.items():
        cargo_downloads.append(_safe(info.get("downloads"), 0))
    cargo_score = min(1.0, (sum(cargo_downloads) / 100_000)) if cargo_downloads else 0.0

    # Solana
    solana_data = solana_intel.run()
    solana_score = _safe(solana_data.get("validator_health"), 0.0)

    # Polkadot
    polkadot_data = polkadot_intel.run()
    spec_version = _safe(polkadot_data.get("spec_version"), 0)
    runtime_upgrades = _safe(polkadot_data.get("runtime_upgrades_24h"), 0)
    polkadot_score = min(1.0, (spec_version / 10_000)) + min(0.3, runtime_upgrades * 0.1)

    # Cosmos
    cosmos_data = cosmos_intel.run()
    gov_activity = _safe(cosmos_data.get("governance_activity"), 0)
    cosmos_score = min(1.0, gov_activity * 0.1)

    # Solidity / EVM
    solidity_data = solidity_intel.run()
    latest_block = _safe(solidity_data.get("latest_block"), 0)
    solidity_score = min(1.0, latest_block / 20_000_000)  # rough normalization

    # Weighted fusion
    score = (
        0.20 * npm_score +
        0.15 * cargo_score +
        0.20 * solana_score +
        0.15 * polkadot_score +
        0.15 * cosmos_score +
        0.15 * solidity_score
    )

    return round(score, 3)


def compute_market_score() -> float:
    # placeholder – later use dex_intel, volatility_intel, depth_intel
    return 0.0


def compute_defi_score() -> float:
    # placeholder – later use tvl_intel, yield_intel, stableflow_intel
    return 0.0


def compute_nft_score() -> float:
    # placeholder – later use magiceden_intel, tensor_intel
    return 0.0


def compute_narrative_score() -> float:
    # placeholder – later use twitter_intel, telegram_intel, discord_intel
    return 0.0


def compute_risk_score() -> float:
    # placeholder – later use risk signals
    return 0.0
