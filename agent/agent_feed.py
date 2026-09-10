from core.uio import build_uio

def build_agent_feed():
    uio = build_uio()
    master = uio["master"]

    return {
        "version": "1.0",
        "timestamp": master["timestamp"],
        "global": {
            "score": master["fused_score"],
            "label": master["label"],
        },
        "signals": {
            "developer": uio["developer"]["scores"]["developer_score"],
            "market": uio["market"]["scores"]["market_score"],
            "defi": uio["defi"]["scores"]["defi_score"],
            "nft": uio["nft"]["scores"]["nft_score"],
            "narrative": uio["narrative"]["scores"]["narrative_score"],
            "risk": uio["risk"]["scores"]["risk_score"],
        },
    }
