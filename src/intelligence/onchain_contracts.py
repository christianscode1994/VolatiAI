from typing import Any, Dict

from src.onchain.etherscan import (
    get_contract_metadata,
    decode_contract_abi,
    get_token_metadata_snapshot,
    classify_internal_txs,
)
from src.offchain.dexscreener import get_pairs_by_token
from src.offchain.defillama import get_token_tvl


def fused_contract_intelligence(token_address: str, chain: str = "ethereum") -> Dict[str, Any]:
    contract_meta = get_contract_metadata(token_address)
    abi = decode_contract_abi(token_address)
    token_meta = get_token_metadata_snapshot(token_address)
    internal_traces = classify_internal_txs(token_address)

    dex_data = get_pairs_by_token(token_address)
    llama_tvl = get_token_tvl(token_address, chain=chain)

    return {
        "address": token_address,
        "chain": chain,
        "contract": {
            "metadata": contract_meta,
            "abi": abi,
        },
        "token": {
            "metadata_snapshot": token_meta,
        },
        "internal_activity": {
            "classified_traces": internal_traces,
        },
        "market": {
            "dexscreener_pairs": dex_data,
        },
        "defi": {
            "defillama_tvl": llama_tvl,
        },
    }
