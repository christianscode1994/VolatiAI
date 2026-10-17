from src.nft.solana.magiceden_collections import get_collection_stats
from src.nft.solana.magiceden_listings import get_listings
from src.nft.solana.magiceden_wallets import get_wallet_tokens
from src.nft.solana.magiceden_activity import get_activity
from src.nft.evm.metadata import get_evm_nft_metadata
from src.nft.evm.transfers import get_evm_nft_transfers

import os
RPC_URLS = {
    "ethereum": os.getenv("PUBLIC_ETH_RPC", ""),
    "polygon": os.getenv("PUBLIC_POLYGON_RPC", ""),
    "base": os.getenv("PUBLIC_ETH_RPC", ""),
    "arbitrum": os.getenv("PUBLIC_ETH_RPC", ""),
    "optimism": os.getenv("PUBLIC_ETH_RPC", ""),
}

def unified_nft(chain: str, identifier: dict) -> dict:
    if chain == "solana":
        symbol = identifier["symbol"]
        wallet = identifier.get("wallet")
        return {
            "stats": get_collection_stats(symbol),
            "listings": get_listings(symbol),
            "wallet": get_wallet_tokens(wallet) if wallet else None,
            "activity": get_activity(symbol),
        }

    if chain in RPC_URLS:
        rpc = RPC_URLS[chain]
        contract = identifier["contract"]
        token_id = identifier.get("token_id")
        return {
            "metadata": get_evm_nft_metadata(rpc, contract, token_id),
            "transfers": get_evm_nft_transfers(rpc, contract),
        }

    return {}
