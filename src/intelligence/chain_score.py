from src.fusion.chain_unified import unified_chain

def norm(x, max_val):
    if x is None:
        return 0.0
    return min(1.0, max(0.0, x / max_val))

def chain_score(chain: str) -> dict:
    state = unified_chain(chain)

    tps = state.get("tps", 0)
    fees = state.get("fees", 0)
    congestion = state.get("congestion", 0)
    finality = state.get("finality", 0)

    tps_score = norm(tps, 5000)
    fee_score = max(0.0, 1.0 - norm(fees, 0.01))
    congestion_score = max(0.0, 1.0 - congestion)
    finality_score = finality

    final = (
        0.3 * tps_score +
        0.2 * fee_score +
        0.2 * congestion_score +
        0.3 * finality_score
    )

    return {
        "tps_score": tps_score,
        "fee_score": fee_score,
        "congestion_score": congestion_score,
        "finality_score": finality_score,
        "final_score": final,
    }
