from modules.developer import (
    npm_intel,
    cargo_intel,
    solana_intel,
    polkadot_intel,
    cosmos_intel,
    solidity_intel,
)

from modules.market import dex_intel, volatility_intel, depth_intel
from modules.defi import tvl_intel, yield_intel, stableflow_intel
from modules.nft import magiceden_intel, tensor_intel
from modules.narratives import twitter_intel, telegram_intel, discord_intel
from modules.agents import (
    trend_agent,
    whale_agent,
    spoof_agent,
    narrative_agent,
    risk_agent,
)

import core.config as config
import core.fusion as fusion
import time


def build_uio() -> dict:
    uio = {}

    # -------------------------
    # Developer (Pro tier only)
    # -------------------------
    if config.TIER == "pro":
        uio["developer"] = {
            "npm": npm_intel.run(),
            "cargo": cargo_intel.run(),
            "solana": solana_intel.run(),
            "polkadot": polkadot_intel.run(),
            "cosmos": cosmos_intel.run(),
            "solidity": solidity_intel.run(),
            "ecosystem_score": fusion.compute_dev_score(),
        }
    else:
        uio["developer"] = {"tier": "locked"}

    # -------------------------
    # Market
    # -------------------------
    uio["market"] = {
        "dex": dex_intel.run(),
        "volatility": volatility_intel.run(),
        "depth": depth_intel.run(),
        "market_score": fusion.compute_market_score(),
    }

    # -------------------------
    # DeFi
    # -------------------------
    uio["defi"] = {
        "tvl": tvl_intel.run(),
        "yields": yield_intel.run(),
        "stableflows": stableflow_intel.run(),
        "defi_score": fusion.compute_defi_score(),
    }

    # -------------------------
    # NFT
    # -------------------------
    uio["nft"] = {
        "magiceden": magiceden_intel.run(),
        "tensor": tensor_intel.run(),
        "nft_score": fusion.compute_nft_score(),
    }

    # -------------------------
    # Narratives
    # -------------------------
    uio["narratives"] = {
        "twitter": twitter_intel.run(),
        "telegram": telegram_intel.run(),
        "discord": discord_intel.run(),
        "narrative_score": fusion.compute_narrative_score(),
    }

    # -------------------------
    # Risk
    # -------------------------
    uio["risk"] = {
        "liquidations": risk_agent.liquidations(uio),
        "funding": risk_agent.funding(uio),
        "open_interest": risk_agent.oi(uio),
        "risk_score": fusion.compute_risk_score(),
    }

    # -------------------------
    # Agents (Pro tier only)
    # -------------------------
    if config.TIER == "pro":
        uio["agents"] = {
            "trend": trend_agent.run(uio),
            "whale": whale_agent.run(uio),
            "spoof": spoof_agent.run(uio),
            "narrative": narrative_agent.run(uio),
            "risk": risk_agent.run(uio),
        }
    else:
        uio["agents"] = {"tier": "locked"}

    # -------------------------
    # Meta
    # -------------------------
    uio["meta"] = {
        "timestamp": time.time(),
        "version": "1.0.0",
        "tier": config.TIER,
    }

    return uio
