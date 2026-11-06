def chain_watch(intel):
    return {
        "type": "chain_watch",
        "solana_ok": intel["chains"]["solana"]["health_score"] > 0.70,
        "ethereum_ok": intel["chains"]["ethereum"]["congestion_score"] < 0.60,
        "polkadot_ok": intel["chains"]["polkadot"]["health_score"] > 0.70,
    }
