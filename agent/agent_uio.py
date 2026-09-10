from core.uio import build_uio

def build_agent_uio():
    uio = build_uio()
    m = uio["master"]

    return {
        "ts": m["timestamp"],
        "g": m["fused_score"],
        "l": m["label"],
        "d": uio["developer"]["scores"]["developer_score"],
        "m": uio["market"]["scores"]["market_score"],
        "f": uio["defi"]["scores"]["defi_score"],
        "n": uio["nft"]["scores"]["nft_score"],
        "s": uio["narrative"]["scores"]["narrative_score"],
        "r": uio["risk"]["scores"]["risk_score"],
    }
