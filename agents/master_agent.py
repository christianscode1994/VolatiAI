import time

def _norm(x, low, high):
    if high == low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def compute_master_agent(
    developer,
    market,
    defi,
    nft,
    narrative,
    risk,
    agents
):
    """
    Master Agent v1.
    Fuses all intelligence modules + agent outputs into a unified score.
    """

    # Extract module scores
    dev_score = developer["scores"]["developer_score"]
    market_score = market["scores"]["market_score"]
    defi_score = defi["scores"]["defi_score"]
    nft_score = nft["scores"]["nft_score"]
    narrative_score = narrative["scores"]["narrative_score"]
    risk_score = risk["scores"]["risk_score"]

    # Extract agent scores
    trend_score = agents["trend"]["score"]
    whale_score = agents["whale"]["score"]
    spoof_score = agents["spoof"]["score"]
    narrative_agent_score = agents["narrative"]["score"]
    risk_agent_score = agents["risk"]["score"]

    # Intelligence fusion
    # Higher risk → lower final score
    fused_score = (
        0.15 * dev_score +
        0.15 * market_score +
        0.15 * defi_score +
        0.10 * nft_score +
        0.15 * narrative_score +
        0.10 * trend_score +
        0.10 * whale_score +
        0.05 * spoof_score +
        0.05 * narrative_agent_score
    )

    # Risk penalty
    fused_score = fused_score * (1 - risk_score)

    # Clamp
    fused_score = max(0.0, min(1.0, fused_score))

    # Intelligence classification
    if fused_score >= 0.75:
        label = "STRONG"
    elif fused_score >= 0.50:
        label = "MODERATE"
    elif fused_score >= 0.25:
        label = "WEAK"
    else:
        label = "CRITICAL"

    return {
        "timestamp": int(time.time()),
        "fused_score": round(fused_score, 3),
        "label": label,
        "components": {
            "developer": dev_score,
            "market": market_score,
            "defi": defi_score,
            "nft": nft_score,
            "narrative": narrative_score,
            "risk": risk_score,
            "agents": {
                "trend": trend_score,
                "whale": whale_score,
                "spoof": spoof_score,
                "narrative": narrative_agent_score,
                "risk": risk_agent_score,
            }
        }
    }
