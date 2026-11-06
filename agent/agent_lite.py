from core.uio import build_uio

def build_agent_lite():
    uio = build_uio()
    m = uio["master"]
    return {
        "ts": m["timestamp"],
        "g": m["fused_score"],
        "r": uio["risk"]["scores"]["risk_score"],
        "m": uio["market"]["scores"]["market_score"],
    }
